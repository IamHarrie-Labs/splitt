// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Test stand-in for a Safe-style owner: it executes owner calls and answers ERC-1271
///         for one approving key. Real deployments use an audited multisig, never this mock.
contract MockMultisigOwner {
    address public immutable signer;
    constructor(address approvingKey) { signer = approvingKey; }
    function execute(address target, bytes calldata data) external {
        require(msg.sender == signer, "NOT_SIGNER");
        (bool ok, bytes memory result) = target.call(data);
        if (!ok) assembly { revert(add(result, 32), mload(result)) }
    }
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(hash, signature);
        return err == ECDSA.RecoverError.NoError && recovered == signer ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
