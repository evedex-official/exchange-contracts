// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract PythMock {
  mapping(bytes32 id => PythStructs.Price price) public idToPrice;

  function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (PythStructs.Price memory) {
    if (idToPrice[id].publishTime < age) revert("StalePrice");
    return idToPrice[id];
  }

  function getPriceUnsafe(bytes32 id) external view returns (PythStructs.Price memory) {
    return idToPrice[id];
  }

  function setPrice(bytes32 id, PythStructs.Price calldata price) external {
    idToPrice[id] = price;
  }
}
