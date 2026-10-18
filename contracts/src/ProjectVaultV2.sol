// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @notice Mainnet candidate for isolated project accounting and owner-authorized USDC payouts.
/// @dev This candidate is deliberately incompatible with the testnet deployment and must not be
///      deployed with production funds until an independent audit is complete.
contract ProjectVaultV2 is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    struct Project { uint256 balance; uint256 reserveMin; uint256 maxPerPayment; uint256 maxPerDay; uint64 version; bool active; }
    struct Commitment { bytes32 projectId; address payee; uint256 maxAmount; uint256 paid; uint64 activeAfter; bool partialAllowed; bool cancelled; }
    struct Item { bytes32 executionId; bytes32 commitmentId; uint256 amount; }
    struct Authorization { bytes32 planId; bytes32 planHash; bytes32 projectId; uint64 projectVersion; uint64 deadline; }

    IERC20 public immutable usdc;
    uint64 public immutable minimumPayeeChangeDelay;
    address public operator;
    uint256 public totalAccounted;
    uint256 public constant MAX_BATCH = 32;
    bytes32 public constant AUTH_TYPEHASH = keccak256("PlanAuthorization(bytes32 planId,bytes32 planHash,bytes32 projectId,uint64 projectVersion,uint64 deadline,bytes32 itemsHash)");

    mapping(bytes32 => Project) public projects;
    mapping(bytes32 => Commitment) public commitments;
    mapping(bytes32 => bool) public executed;
    mapping(bytes32 => bool) public executedPlan;
    mapping(bytes32 => bool) public usedAttribution;
    mapping(bytes32 => mapping(uint256 => uint256)) public spentOnDay;

    error InvalidInput(); error AlreadyExists(); error UnknownProject(); error NotOperator();
    error InvalidSignature(); error ExpiredAuthorization(); error Replay(); error InvalidBatch();
    error StalePlan(); error IneligibleCommitment(); error WrongProject(); error CommitmentExceeded();
    error PartialForbidden(); error PaymentCapExceeded(); error DailyCapExceeded(); error ReserveBreach();
    error InsufficientUnattributed(); error InsufficientBalance(); error UnsupportedTokenBehavior();

    event ProjectCreated(bytes32 indexed projectId, uint256 reserveMin, uint256 maxPerPayment, uint256 maxPerDay);
    event PolicyChanged(bytes32 indexed projectId, uint64 version, uint256 reserveMin, uint256 maxPerPayment, uint256 maxPerDay);
    event CommitmentAdded(bytes32 indexed commitmentId, bytes32 indexed projectId, address payee, uint256 maxAmount, bool partialAllowed, uint64 activeAfter);
    event CommitmentCancelled(bytes32 indexed commitmentId, bytes32 indexed projectId);
    event PaymentReceived(bytes32 indexed projectId, bytes32 indexed invoiceId, address indexed payer, uint256 amount);
    event PaymentAttributed(bytes32 indexed attributionId, bytes32 indexed projectId, bytes32 invoiceId, uint256 amount, bytes32 evidenceHash);
    event PayoutExecuted(bytes32 indexed executionId, bytes32 indexed commitmentId, bytes32 indexed projectId, address payee, uint256 amount, bytes32 planHash);
    event PlanExecuted(bytes32 indexed planId, bytes32 indexed planHash, bytes32 indexed projectId, uint256 totalAmount);
    event OwnerWithdrawal(bytes32 indexed projectId, address to, uint256 amount);
    event OperatorChanged(address indexed operator);

    constructor(address token, address initialOwner, address initialOperator, uint64 minimumDelaySeconds)
        Ownable(initialOwner) EIP712("Splitt", "2") {
        if (token == address(0) || initialOwner == address(0) || minimumDelaySeconds == 0) revert InvalidInput();
        usdc = IERC20(token);
        operator = initialOperator;
        minimumPayeeChangeDelay = minimumDelaySeconds;
    }

    function _project(bytes32 id) internal view returns (Project storage p) {
        p = projects[id]; if (!p.active) revert UnknownProject();
    }
    function _policy(uint256 perPayment, uint256 perDay) internal pure {
        if (perPayment == 0 || perDay < perPayment) revert InvalidInput();
    }
    function createProject(bytes32 id, uint256 reserveMin, uint256 maxPerPayment, uint256 maxPerDay) external onlyOwner {
        if (id == bytes32(0)) revert InvalidInput();
        if (projects[id].active) revert AlreadyExists();
        _policy(maxPerPayment, maxPerDay);
        projects[id] = Project(0, reserveMin, maxPerPayment, maxPerDay, 1, true);
        emit ProjectCreated(id, reserveMin, maxPerPayment, maxPerDay);
    }
    function setPolicy(bytes32 id, uint256 reserveMin, uint256 maxPerPayment, uint256 maxPerDay) external onlyOwner {
        Project storage p = _project(id); _policy(maxPerPayment, maxPerDay);
        p.reserveMin = reserveMin; p.maxPerPayment = maxPerPayment; p.maxPerDay = maxPerDay; p.version++;
        emit PolicyChanged(id, p.version, reserveMin, maxPerPayment, maxPerDay);
    }
    function addCommitment(bytes32 cid, bytes32 pid, address payee, uint256 maxAmount, bool partialAllowed) external onlyOwner {
        Project storage p = _project(pid);
        if (cid == bytes32(0) || payee == address(0) || payee == address(this) || maxAmount == 0) revert InvalidInput();
        if (commitments[cid].payee != address(0)) revert AlreadyExists();
        if (!partialAllowed && maxAmount > p.maxPerPayment) revert PaymentCapExceeded();
        uint64 activeAfter = uint64(block.timestamp) + minimumPayeeChangeDelay;
        commitments[cid] = Commitment(pid, payee, maxAmount, 0, activeAfter, partialAllowed, false);
        p.version++;
        emit CommitmentAdded(cid, pid, payee, maxAmount, partialAllowed, activeAfter);
    }
    function cancelCommitment(bytes32 cid) external onlyOwner {
        Commitment storage c = commitments[cid];
        if (c.payee == address(0) || c.cancelled) revert IneligibleCommitment();
        c.cancelled = true; projects[c.projectId].version++;
        emit CommitmentCancelled(cid, c.projectId);
    }
    function deposit(bytes32 pid, bytes32 invoiceId, uint256 amount) external nonReentrant {
        Project storage p = _project(pid); if (amount == 0) revert InvalidInput();
        uint256 beforeBalance = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        if (usdc.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedTokenBehavior();
        p.balance += amount; totalAccounted += amount;
        emit PaymentReceived(pid, invoiceId, msg.sender, amount);
    }
    function attribute(bytes32 attributionId, bytes32 pid, bytes32 invoiceId, uint256 amount, bytes32 evidenceHash) external onlyOwner {
        Project storage p = _project(pid);
        if (attributionId == bytes32(0) || amount == 0) revert InvalidInput();
        if (usedAttribution[attributionId]) revert Replay();
        if (amount > unattributed()) revert InsufficientUnattributed();
        usedAttribution[attributionId] = true; p.balance += amount; totalAccounted += amount;
        emit PaymentAttributed(attributionId, pid, invoiceId, amount, evidenceHash);
    }
    function unattributed() public view returns (uint256) { return usdc.balanceOf(address(this)) - totalAccounted; }
    function authorizationDigest(Authorization calldata a, Item[] calldata items) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(AUTH_TYPEHASH, a.planId, a.planHash, a.projectId, a.projectVersion, a.deadline, keccak256(abi.encode(items)))));
    }
    /// @dev ERC-1271 as well as ECDSA, so a multisig or smart-account owner can authorize plans.
    ///      Inlined rather than SignatureChecker, whose OpenZeppelin 5.4 build needs Cancun's mcopy.
    function _ownerSigned(bytes32 digest, bytes calldata signature) internal view returns (bool) {
        address o = owner();
        if (o.code.length == 0) {
            (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
            return err == ECDSA.RecoverError.NoError && recovered == o;
        }
        try IERC1271(o).isValidSignature(digest, signature) returns (bytes4 magic) {
            return magic == IERC1271.isValidSignature.selector;
        } catch {
            return false;
        }
    }
    function payBatch(Authorization calldata a, bytes calldata ownerSignature, Item[] calldata items) external nonReentrant whenNotPaused {
        if (msg.sender != operator) revert NotOperator();
        if (!_ownerSigned(authorizationDigest(a, items), ownerSignature)) revert InvalidSignature();
        if (block.timestamp > a.deadline) revert ExpiredAuthorization();
        if (a.planId == bytes32(0) || items.length == 0 || items.length > MAX_BATCH) revert InvalidBatch();
        if (executedPlan[a.planId]) revert Replay();
        Project storage p = _project(a.projectId);
        if (p.version != a.projectVersion) revert StalePlan();
        uint256 total;
        for (uint256 i; i < items.length; i++) {
            Item calldata item = items[i]; Commitment storage c = commitments[item.commitmentId];
            if (item.executionId == bytes32(0) || item.amount == 0) revert InvalidInput();
            if (executed[item.executionId]) revert Replay();
            for (uint256 j; j < i; j++) if (items[j].commitmentId == item.commitmentId || items[j].executionId == item.executionId) revert InvalidBatch();
            if (c.payee == address(0) || c.cancelled || block.timestamp < c.activeAfter) revert IneligibleCommitment();
            if (c.projectId != a.projectId) revert WrongProject();
            if (item.amount > c.maxAmount - c.paid) revert CommitmentExceeded();
            if (!c.partialAllowed && item.amount != c.maxAmount - c.paid) revert PartialForbidden();
            if (item.amount > p.maxPerPayment) revert PaymentCapExceeded();
            total += item.amount;
        }
        uint256 day = block.timestamp / 1 days;
        if (spentOnDay[a.projectId][day] > p.maxPerDay || total > p.maxPerDay - spentOnDay[a.projectId][day]) revert DailyCapExceeded();
        if (p.balance < p.reserveMin || total > p.balance - p.reserveMin) revert ReserveBreach();
        executedPlan[a.planId] = true; p.balance -= total; totalAccounted -= total; spentOnDay[a.projectId][day] += total;
        for (uint256 i; i < items.length; i++) { executed[items[i].executionId] = true; commitments[items[i].commitmentId].paid += items[i].amount; }
        for (uint256 i; i < items.length; i++) {
            Item calldata item = items[i]; address payee = commitments[item.commitmentId].payee;
            usdc.safeTransfer(payee, item.amount);
            emit PayoutExecuted(item.executionId, item.commitmentId, a.projectId, payee, item.amount, a.planHash);
        }
        emit PlanExecuted(a.planId, a.planHash, a.projectId, total);
    }
    function ownerWithdraw(bytes32 pid, uint256 amount, address to) external onlyOwner nonReentrant {
        Project storage p = _project(pid);
        if (to == address(0) || to == address(this) || amount == 0) revert InvalidInput();
        if (p.balance < p.reserveMin || amount > p.balance - p.reserveMin) revert ReserveBreach();
        p.balance -= amount; totalAccounted -= amount; p.version++;
        usdc.safeTransfer(to, amount); emit OwnerWithdrawal(pid, to, amount);
    }
    /// @dev Zero disables the operator. Deposits and owner reserve recovery remain possible while paused.
    function setOperator(address next) external onlyOwner { operator = next; emit OperatorChanged(next); }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
