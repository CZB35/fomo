// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

interface IAIFomoKing {
    function owner() external view returns (address);
}

contract Deploy is Script {
    function run() external {
        // Read env vars (provide defaults where reasonable)
        address token = vm.envAddress("TOKEN");
        address devWallet = vm.envAddress("DEV_WALLET");
        uint256 entranceFee = vm.envOr("ENTRANCE_FEE", uint256(1_000_000)); // 1 USDT (6 decimals)
        uint256 devEntryBps = vm.envOr("DEV_ENTRY_BPS", uint256(1000));      // 10%
        uint256 referralBps = vm.envOr("REFERRAL_BPS", uint256(500));        // 5%
        uint256 roundDuration = vm.envOr("ROUND_DURATION", uint256(900));    // 15 minutes
        uint256 winFeeBps = vm.envOr("WIN_FEE_BPS", uint256(500));           // 5%

        vm.startBroadcast();
        address deployed = deployAIFomoKing(token, devWallet, entranceFee, devEntryBps, referralBps, roundDuration, winFeeBps);
        vm.stopBroadcast();

        console2.log("AIFomoKing deployed at:", deployed);
    }

    function deployAIFomoKing(
        address token,
        address devWallet,
        uint256 entranceFee,
        uint256 devEntryBps,
        uint256 referralBps,
        uint256 roundDuration,
        uint256 winFeeBps
    ) internal returns (address deployed) {
        bytes memory bytecode = abi.encodePacked(
            type(AIFomoKing).creationCode,
            abi.encode(token, devWallet, entranceFee, devEntryBps, referralBps, roundDuration, winFeeBps)
        );
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
            if iszero(deployed) { revert(0, 0) }
        }
    }
}

// Include the contract code for create2-less deployment convenience
interface IERC20DeployHelper {
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract AIFomoKing {
    event NewMessage(address indexed player, string message, uint256 timestamp);
    event RoundWon(address indexed winner, uint256 amount, uint256 round);
    event InviteCodeSet(address indexed owner, bytes32 indexed code);
    event InviteBound(address indexed user, address indexed inviter, bytes32 inviterCode);
    error NotOwner();
    error RoundNotActive();
    error RoundNotEnded();
    error InsufficientAllowance();
    error TransferFailed();
    error CodeAlreadySet();
    error CodeTaken();
    error InvalidCode();
    address public owner;
    IERC20DeployHelper public immutable token;
    uint256 public immutable entranceFee;
    uint256 public immutable devEntryBps;
    uint256 public immutable referralBps;
    uint256 public immutable winFeeBps;
    uint256 public roundDuration;
    address public immutable devWallet;
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
    constructor(address _token,address _devWallet,uint256 _entranceFee,uint256 _devEntryBps,uint256 _referralBps,uint256 _roundDuration,uint256 _winFeeBps){
        require(_token!=address(0)&&_devWallet!=address(0),"ZERO_ADDR");
        require(_entranceFee>0,"FEE_ZERO");
        require(_devEntryBps+_referralBps<=10_000,"BPS_SUM_TOO_HIGH");
        require(_winFeeBps<=5_000,"WIN_BPS_TOO_HIGH");
        require(_roundDuration>=60,"DURATION_TOO_SHORT");
        owner=msg.sender; token=IERC20DeployHelper(_token); devWallet=_devWallet; entranceFee=_entranceFee; devEntryBps=_devEntryBps; referralBps=_referralBps; roundDuration=_roundDuration; winFeeBps=_winFeeBps; currentRound=1; }
    function transferOwnership(address n) external onlyOwner { require(n!=address(0),"ZERO_ADDR"); owner=n; }
    function setRoundDuration(uint256 d) external onlyOwner { require(d>=60,"DURATION_TOO_SHORT"); roundDuration=d; }
    function extendRoundDuration(uint256 t) external onlyOwner { require(t>0,"NO_EXTEND"); if(!roundActive) revert RoundNotActive(); roundEndTime+=t; }
    function addInitialReward(uint256 a) external onlyOwner nonReentrant { require(a>0,"AMOUNT_ZERO"); _safeTFfrom(msg.sender,address(this),a); pot+=a; }
    function setInviteCode(bytes32 c) external { if(inviteCodeOf[msg.sender]!=bytes32(0)) revert CodeAlreadySet(); require(c!=bytes32(0),"EMPTY_CODE"); if(codeOwner[c]!=address(0)) revert CodeTaken(); inviteCodeOf[msg.sender]=c; codeOwner[c]=msg.sender; emit InviteCodeSet(msg.sender,c); }
    function sendMessage(string calldata m, bytes32 code) external nonReentrant {
        if(roundActive && block.timestamp>roundEndTime){ _finalize(); }
        address inv=inviterOf[msg.sender];
        if(inv==address(0) && code!=bytes32(0)){
            address o=codeOwner[code]; if(o==address(0)) revert InvalidCode(); require(o!=msg.sender,"SELF_INVITE"); inviterOf[msg.sender]=o; inviteeCount[o]+=1; inv=o; emit InviteBound(msg.sender,o,code);
        }
        _collect(msg.sender);
        uint256 devAmt=(entranceFee*devEntryBps)/10_000; uint256 refAmt=inv!=address(0)?(entranceFee*referralBps)/10_000:0; uint256 toPot=entranceFee-devAmt-refAmt;
        if(devAmt>0){ _safeTF(address(this),devWallet,devAmt); } if(refAmt>0){ _safeTF(address(this),inv,refAmt); referralRewardReceived[inv]+=refAmt; } if(toPot>0){ pot+=toPot; }
        hasPaidInRound[currentRound][msg.sender]=true; lastPlayer=msg.sender; roundActive=true; roundEndTime=block.timestamp+roundDuration; emit NewMessage(msg.sender,m,block.timestamp);
    }
    function finalize() external nonReentrant { if(!roundActive) revert RoundNotActive(); if(block.timestamp<=roundEndTime) revert RoundNotEnded(); _finalize(); }
    function _finalize() internal { if(lastPlayer!=address(0)&&pot>0){ uint256 devCut=(pot*winFeeBps)/10_000; uint256 winner=pot-devCut; if(devCut>0) _safeTF(address(this),devWallet,devCut); _safeTF(address(this),lastPlayer,winner); emit RoundWon(lastPlayer,pot,currentRound);} currentRound+=1; pot=0; lastPlayer=address(0); roundEndTime=0; roundActive=false; }
    function visiblePot() external view returns(uint256){ if(!hasPaidInRound[currentRound][msg.sender]) return 0; return pot; }
    function hasAccess(address u) external view returns(bool){ return hasPaidInRound[currentRound][u]; }
    function timeLeft() external view returns(uint256){ if(!roundActive) return 0; if(block.timestamp>=roundEndTime) return 0; return roundEndTime-block.timestamp; }
    function _collect(address from) internal { uint256 a=token.allowance(from,address(this)); if(a<entranceFee) revert InsufficientAllowance(); _safeTFfrom(from,address(this),entranceFee); }
    function _safeTFfrom(address f,address t,uint256 v) internal { bool ok=token.transferFrom(f,t,v); if(!ok) revert TransferFailed(); }
    function _safeTF(address f,address t,uint256 v) internal { if(f==address(this)){ bool ok=token.transfer(t,v); if(!ok) revert TransferFailed(); } else { _safeTFfrom(f,t,v); } }
}
