// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function decimals() external view returns (uint8);
}

/// @title AI Fomo King
/// @notice Timed round-based DApp where each message extends the timer; last messenger wins the pot.
/// - Payments are in an ERC20 token (e.g., USDT with 6 decimals on testnets)
/// - On each message, entrance fee is split into: dev entry fee (bps), referral reward (bps), remainder to pot
/// - When the round ends, winner (lastPlayer) receives pot minus developer win fee (bps)
contract AIFomoKing {
    // -------------------- Types & Interfaces --------------------

    // -------------------- Events --------------------
    event NewMessage(address indexed player, string message, uint256 timestamp);
    event RoundWon(address indexed winner, uint256 amount, uint256 round);
    event InviteCodeSet(address indexed owner, bytes32 indexed code);
    event InviteBound(address indexed user, address indexed inviter, bytes32 inviterCode);

    // -------------------- Errors --------------------
    error NotOwner();
    error RoundNotActive();
    error RoundNotEnded();
    error InsufficientAllowance();
    error TransferFailed();
    error CodeAlreadySet();
    error CodeTaken();
    error InvalidCode();

    // -------------------- Storage --------------------
    address public owner;
    IERC20 public immutable token; // Stable token used for payments (e.g., USDT-like ERC20)

    // Configurable economics (immutable where possible)
    uint256 public immutable entranceFee;      // in token's smallest unit, e.g., 1e6 for 1 USDT (6 decimals)
    uint256 public immutable devEntryBps;      // immediate fee per message to dev wallet, in basis points (e.g., 1000 = 10%)
    uint256 public immutable referralBps;      // immediate reward per message to referrer, in basis points (e.g., 500 = 5%)
    uint256 public immutable winFeeBps;        // developer fee at win in basis points (e.g., 500 = 5%)
    uint256 public roundDuration;              // per-message timer duration in seconds (mutable by owner)

    address public immutable devWallet;        // developer fee receiver

    // Round state
    uint256 public currentRound;               // round index starting from 1
    uint256 public roundEndTime;               // timestamp when current round ends (0 if inactive)
    uint256 public pot;                        // accumulated prize for current round
    address public lastPlayer;                 // last message sender in current round
    bool public roundActive;                   // whether there is an active round timer

    // Access control for visibility: who has paid in the current round
    mapping(uint256 => mapping(address => bool)) private hasPaidInRound;

    // Referral system
    mapping(address => bytes32) public inviteCodeOf;   // user's chosen code (immutable once set)
    mapping(bytes32 => address) public codeOwner;      // code -> owner
    mapping(address => address) public inviterOf;      // user -> inviter
    mapping(address => uint256) public inviteeCount;   // inviter -> number of direct invitees
    mapping(address => uint256) public referralRewardReceived; // total referral rewards received

    // Reentrancy guard
    uint256 private locked = 1;
    modifier nonReentrant() {
        require(locked == 1, "REENTRANT");
        locked = 2;
        _;
        locked = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address _token,
        address _devWallet,
        uint256 _entranceFee,
        uint256 _devEntryBps,
        uint256 _referralBps,
        uint256 _roundDuration,
        uint256 _winFeeBps
    ) {
        require(_token != address(0) && _devWallet != address(0), "ZERO_ADDR");
        require(_entranceFee > 0, "FEE_ZERO");
        require(_devEntryBps + _referralBps <= 10_000, "BPS_SUM_TOO_HIGH");
        require(_winFeeBps <= 5_000, "WIN_BPS_TOO_HIGH"); // cap at 50% as sanity
        require(_roundDuration >= 60, "DURATION_TOO_SHORT");

        owner = msg.sender;
        token = IERC20(_token);
        devWallet = _devWallet;
        entranceFee = _entranceFee;          // e.g., 1_000_000 for 1 USDT (6 decimals)
        devEntryBps = _devEntryBps;          // e.g., 1000 = 10%
        referralBps = _referralBps;          // e.g., 500 = 5%
        roundDuration = _roundDuration;      // e.g., 600-900 seconds
        winFeeBps = _winFeeBps;              // e.g., 500 = 5%

        // start from round 1 but inactive until first message
        currentRound = 1;
        roundActive = false;
    }

    // -------------------- Owner controls --------------------
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDR");
        owner = newOwner;
    }

    function setRoundDuration(uint256 newDuration) external onlyOwner {
        require(newDuration >= 60, "DURATION_TOO_SHORT");
        roundDuration = newDuration;
    }

    /// @notice Owner may extend the current active round by extraTime seconds
    function extendRoundDuration(uint256 extraTime) external onlyOwner {
        require(extraTime > 0, "NO_EXTEND");
        if (!roundActive) revert RoundNotActive();
        roundEndTime += extraTime;
    }

    /// @notice Owner injects initial reward into the pot from owner's token balance
    function addInitialReward(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "AMOUNT_ZERO");
        _safeTransferFrom(msg.sender, address(this), amount);
        pot += amount;
    }

    /// @notice User can set a unique invite code once.
    function setInviteCode(bytes32 code) external {
        if (inviteCodeOf[msg.sender] != bytes32(0)) revert CodeAlreadySet();
        require(code != bytes32(0), "EMPTY_CODE");
        if (codeOwner[code] != address(0)) revert CodeTaken();
        inviteCodeOf[msg.sender] = code;
        codeOwner[code] = msg.sender;
        emit InviteCodeSet(msg.sender, code);
    }

    // -------------------- Core game logic --------------------

    /// @notice Player posts a message by paying the entrance fee. Resets timer.
    /// @param message_ The message to broadcast (emitted as event)
    /// @param inviterCode Optional inviter code (bytes32). Only used if caller has no inviter yet.
    function sendMessage(string calldata message_, bytes32 inviterCode) external nonReentrant {
        // If an active round exists and time is over, finalize before processing a new message
        if (roundActive && block.timestamp > roundEndTime) {
            _finalize();
        }

        // Resolve inviter if any and not set yet
        address inviter = inviterOf[msg.sender];
        if (inviter == address(0) && inviterCode != bytes32(0)) {
            address codeOwner_ = codeOwner[inviterCode];
            if (codeOwner_ == address(0)) revert InvalidCode();
            require(codeOwner_ != msg.sender, "SELF_INVITE");
            inviterOf[msg.sender] = codeOwner_;
            inviteeCount[codeOwner_] += 1;
            inviter = codeOwner_;
            emit InviteBound(msg.sender, codeOwner_, inviterCode);
        }

        // Collect fee
        _collectEntranceFee(msg.sender);

        // Split entrance fee
        uint256 devAmt = (entranceFee * devEntryBps) / 10_000;
        uint256 refAmt = inviter != address(0) ? (entranceFee * referralBps) / 10_000 : 0;
        uint256 toPot = entranceFee - devAmt - refAmt;

        if (devAmt > 0) {
            _safeTransfer(address(this), devWallet, devAmt);
        }
        if (refAmt > 0) {
            _safeTransfer(address(this), inviter, refAmt);
            referralRewardReceived[inviter] += refAmt;
        }
        if (toPot > 0) {
            pot += toPot;
        }

        // Mark access and update round state
        hasPaidInRound[currentRound][msg.sender] = true;
        lastPlayer = msg.sender;

        // (re)start or extend timer
        roundActive = true;
        roundEndTime = block.timestamp + roundDuration;

        emit NewMessage(msg.sender, message_, block.timestamp);
    }

    /// @notice Anyone can finalize when the timer has ended; pays out pot to the last player minus dev fee.
    function finalize() external nonReentrant {
        if (!roundActive) revert RoundNotActive();
        if (block.timestamp <= roundEndTime) revert RoundNotEnded();
        _finalize();
    }

    function _finalize() internal {
        // settle pot to lastPlayer, take dev win fee
        if (lastPlayer != address(0) && pot > 0) {
            uint256 devCut = (pot * winFeeBps) / 10_000;
            uint256 winnerAmount = pot - devCut;
            if (devCut > 0) _safeTransfer(address(this), devWallet, devCut);
            _safeTransfer(address(this), lastPlayer, winnerAmount);
            emit RoundWon(lastPlayer, pot, currentRound);
        }

        // reset for next round
        currentRound += 1;
        pot = 0;
        lastPlayer = address(0);
        roundEndTime = 0;
        roundActive = false;
    }

    // -------------------- Views --------------------

    /// @notice Returns the pot visible to the caller. Hidden (returns 0) unless the caller has paid in the current round.
    function visiblePot() external view returns (uint256) {
        if (!hasPaidInRound[currentRound][msg.sender]) return 0;
        return pot;
    }

    /// @notice Returns whether the user has access (has paid) in the current round.
    function hasAccess(address user) external view returns (bool) {
        return hasPaidInRound[currentRound][user];
    }

    /// @notice Helper returning remaining seconds in current round (0 if inactive or ended).
    function timeLeft() external view returns (uint256) {
        if (!roundActive) return 0;
        if (block.timestamp >= roundEndTime) return 0;
        return roundEndTime - block.timestamp;
    }

    // -------------------- Internal helpers --------------------

    function _collectEntranceFee(address from) internal {
        uint256 allowance_ = token.allowance(from, address(this));
        if (allowance_ < entranceFee) revert InsufficientAllowance();
        _safeTransferFrom(from, address(this), entranceFee);
    }

    function _safeTransferFrom(address from, address to, uint256 value) internal {
        bool ok = token.transferFrom(from, to, value);
        if (!ok) revert TransferFailed();
    }

    function _safeTransfer(address from, address to, uint256 value) internal {
        if (from == address(this)) {
            bool ok = token.transfer(to, value);
            if (!ok) revert TransferFailed();
        } else {
            _safeTransferFrom(from, to, value);
        }
    }
}
