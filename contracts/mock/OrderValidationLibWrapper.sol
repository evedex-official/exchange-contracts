// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import "../lib/OrderValidationLib.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

contract OrderValidationWrapper {
    using OrderValidationLib for *;

    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
    keccak256(abi.encodePacked("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));

    bytes32 public constant WITHDRAWAL_ORDER_TYPEHASH = OrderValidationLib.WITHDRAWAL_ORDER_TYPEHASH;
   function buildDomainSeparator() public view returns (bytes32) {
    return OrderValidationLib.buildDomainSeparator();
   }

   function getWithdrawalOrderTypeValueHash(OrderWithdrawal memory withdrawalOrder) public pure returns (bytes32) {
    return OrderValidationLib._getWithdrawalOrderTypeValueHash(withdrawalOrder);
   }

  function getWithdrawalOrderDigest(OrderWithdrawal memory _withdrawalOrder) public view returns (bytes32) {
    return OrderValidationLib.getWithdrawalOrderDigest(_withdrawalOrder);
  }

    function checkSignature(address signer, bytes32 digest, bytes memory signature) public view {
        return OrderValidationLib._checkSignature(signer, digest, signature);
    }

    function isSignatureValid(address signer, bytes32 digest, bytes memory signature) public view returns (bool) {
        return SignatureChecker.isValidSignatureNow(signer, digest, signature);
    }

}