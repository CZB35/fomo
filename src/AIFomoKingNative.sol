// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AI Fomo King (Native ETH/BNB)
/// @notice Players pay native coin (ETH/BNB) per message; last player wins pot.
contract AIFomoKingNative {
    event NewMessage(address indexed player, string message, uint256 timestamp);
    event RoundWon(address indexed winner, uint256 amount, uint256 round);
    event InviteCodeSet(address indexed owner, bytes32 indexed code);
    event InviteBound(address indexed user, address indexed inviter, bytes32 inviterCode);

    error NotOwner();
    error RoundNotActive();
    error RoundNotEnded();
    error InvalidCode();
    error InsufficientPayment();
    error TransferFailed();
    error CodeAlreadySet();
    error CodeTaken();

    address public owner;
    uint256 public immutable entranceFee;  // Cannot be changed after deployment
    uint256 public devEntryBps;  // Can be changed by owner
    uint256 public referralBps;  // Can be changed by owner
    uint256 public winFeeBps;  // Can be changed by owner
    uint256 public roundDuration;  // Can be changed by owner
    address public immutable devWallet;  // Cannot be changed after deployment
    
    // Pending values for next round (if changed during active round)
    uint256 public pendingDevEntryBps;
    uint256 public pendingReferralBps;
    uint256 public pendingWinFeeBps;
    uint256 public pendingRoundDuration;
    bool public hasPendingDevEntryBps;
    bool public hasPendingReferralBps;
    bool public hasPendingWinFeeBps;
    bool public hasPendingRoundDuration;

    uint256 public currentRound;
    uint256 public roundEndTime;
    uint256 public pot;
    address public lastPlayer;
    bool public roundActive;

    mapping(uint256 => mapping(address => bool)) private hasPaidInRound;
    mapping(address => bytes32) public inviteCodeOf;
    mapping(bytes32 => address) public codeOwner;
    mapping(address => address) public inviterOf;
    mapping(address => uint256) public inviteeCount;
    mapping(address => uint256) public referralRewardReceived;

    uint256 private locked = 1;
    modifier nonReentrant() { require(locked == 1, "REENTRANT"); locked = 2; _; locked = 1; }
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(
        address _devWallet,
        uint256 _entranceFee,
        uint256 _devEntryBps,
        uint256 _referralBps,
        uint256 _roundDuration,
        uint256 _winFeeBps
    ) {
        require(_devWallet != address(0), "ZERO_ADDR");
        require(_entranceFee > 0, "FEE_ZERO");
        require(_devEntryBps + _referralBps <= 10_000, "BPS_SUM_TOO_HIGH");
        require(_winFeeBps <= 5_000, "WIN_BPS_TOO_HIGH");
        require(_roundDuration >= 60, "DURATION_TOO_SHORT");

        owner = msg.sender;
        devWallet = _devWallet;
        entranceFee = _entranceFee;
        devEntryBps = _devEntryBps;
        referralBps = _referralBps;
        roundDuration = _roundDuration;
        winFeeBps = _winFeeBps;
        currentRound = 1;
    }

    function transferOwnership(address n) external onlyOwner { require(n != address(0), "ZERO_ADDR"); owner = n; }
    
    function setRoundDuration(uint256 d) external onlyOwner { 
        require(d >= 60, "DURATION_TOO_SHORT");
        if (roundActive) {
            pendingRoundDuration = d;
            hasPendingRoundDuration = true;
        } else {
            roundDuration = d;
        }
    }
    
    function setDevEntryBps(uint256 bps) external onlyOwner {
        require(bps + referralBps <= 10_000, "BPS_SUM_TOO_HIGH");
        if (roundActive) {
            pendingDevEntryBps = bps;
            hasPendingDevEntryBps = true;
        } else {
            devEntryBps = bps;
        }
    }
    
    function setReferralBps(uint256 bps) external onlyOwner {
        require(devEntryBps + bps <= 10_000, "BPS_SUM_TOO_HIGH");
        if (roundActive) {
            pendingReferralBps = bps;
            hasPendingReferralBps = true;
        } else {
            referralBps = bps;
        }
    }
    
    function setWinFeeBps(uint256 bps) external onlyOwner {
        require(bps <= 5_000, "WIN_BPS_TOO_HIGH");
        if (roundActive) {
            pendingWinFeeBps = bps;
            hasPendingWinFeeBps = true;
        } else {
            winFeeBps = bps;
        }
    }
    
    function addInitialReward() external payable onlyOwner nonReentrant { require(msg.value > 0, "AMOUNT_ZERO"); pot += msg.value; }
    
    function setInviteCode(bytes32 c) external {
        if (inviteCodeOf[msg.sender] != bytes32(0)) revert CodeAlreadySet();
        require(c != bytes32(0), "EMPTY_CODE");
        if (codeOwner[c] != address(0)) revert CodeTaken();
        inviteCodeOf[msg.sender] = c;
        codeOwner[c] = msg.sender;
        emit InviteCodeSet(msg.sender, c);
    }

    function sendMessage(string calldata m, bytes32 code) external payable nonReentrant {
        if (msg.value < entranceFee) revert InsufficientPayment();
        if (roundActive && block.timestamp > roundEndTime) { _finalize(); }

        // Bind invite code if provided and not already bound
        address inv = inviterOf[msg.sender];
        if (inv == address(0) && code != bytes32(0)) {
            // Try to interpret code as an address (last 20 bytes)
            address directAddr = address(uint160(uint256(code)));
            
            // First check if it's a registered code
            address o = codeOwner[code];
            
            // If not a registered code but looks like a valid address, use it directly
            if (o == address(0) && directAddr != address(0)) {
                o = directAddr;
            }
            
            if (o == address(0)) revert InvalidCode();
            require(o != msg.sender, "SELF_INVITE");
            inviterOf[msg.sender] = o;
            inviteeCount[o] += 1;
            inv = o;
            emit InviteBound(msg.sender, o, code);
        }

        // Pay referral reward immediately if inviter exists
        uint256 refAmt = inv != address(0) ? (entranceFee * referralBps) / 10_000 : 0;
        uint256 toPot = entranceFee - refAmt;
        
        if (refAmt > 0) {
            _safeTransfer(inv, refAmt);
            referralRewardReceived[inv] += refAmt;
        }
        
        // Rest goes to pot, dev fee deducted at round end
        pot += toPot;

        // Refund excess
        if (msg.value > entranceFee) {
            _safeTransfer(msg.sender, msg.value - entranceFee);
        }

        hasPaidInRound[currentRound][msg.sender] = true;
        lastPlayer = msg.sender;
        roundActive = true;
        roundEndTime = block.timestamp + roundDuration;
        emit NewMessage(msg.sender, m, block.timestamp);
    }

    function finalize() external nonReentrant {
        if (!roundActive) revert RoundNotActive();
        if (block.timestamp <= roundEndTime) revert RoundNotEnded();
        _finalize();
    }

    function _finalize() internal {
        if (lastPlayer != address(0) && pot > 0) {
            uint256 totalPot = pot;
            
            // Deduct all fees at round end:
            // 1. Dev entry fee (devEntryBps) - from all entries
            // 2. Dev win fee (winFeeBps) - from final pot
            // 3. Next round seed (7%)
            uint256 devEntryCut = (totalPot * devEntryBps) / 10_000;
            uint256 devWinCut = (totalPot * winFeeBps) / 10_000;
            uint256 nextRoundSeed = (totalPot * 700) / 10_000; // 7% for next round
            uint256 totalDevCut = devEntryCut + devWinCut;
            uint256 winnerAmount = totalPot - totalDevCut - nextRoundSeed;
            
            if (totalDevCut > 0) _safeTransfer(devWallet, totalDevCut);
            if (winnerAmount > 0) _safeTransfer(lastPlayer, winnerAmount);
            emit RoundWon(lastPlayer, totalPot, currentRound);
            
            // Carry 7% to next round
            pot = nextRoundSeed;
        } else {
            // No winner, keep pot for next round
        }
        
        // Apply pending changes for next round
        if (hasPendingRoundDuration) {
            roundDuration = pendingRoundDuration;
            hasPendingRoundDuration = false;
        }
        if (hasPendingDevEntryBps) {
            devEntryBps = pendingDevEntryBps;
            hasPendingDevEntryBps = false;
        }
        if (hasPendingReferralBps) {
            referralBps = pendingReferralBps;
            hasPendingReferralBps = false;
        }
        if (hasPendingWinFeeBps) {
            winFeeBps = pendingWinFeeBps;
            hasPendingWinFeeBps = false;
        }
        
        currentRound += 1;
        lastPlayer = address(0);
        roundEndTime = 0;
        roundActive = false;
    }

    function visiblePot() external view returns (uint256) {
        if (!hasPaidInRound[currentRound][msg.sender]) return 0;
        return pot;
    }

    function hasAccess(address u) external view returns (bool) { return hasPaidInRound[currentRound][u]; }
    function timeLeft() external view returns (uint256) {
        if (!roundActive) return 0;
        if (block.timestamp >= roundEndTime) return 0;
        return roundEndTime - block.timestamp;
    }

    function _safeTransfer(address to, uint256 value) internal {
        (bool ok, ) = to.call{value: value}("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {}
}
