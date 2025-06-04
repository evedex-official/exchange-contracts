// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/Arrays.sol)
// This file was procedurally generated from scripts/generate/templates/Arrays.js.

pragma solidity ^0.8.20;

import {Comparators} from "@openzeppelin/contracts/utils/Comparators.sol";
import {SlotDerivation} from "@openzeppelin/contracts/utils/SlotDerivation.sol";
import {StorageSlot} from "@openzeppelin/contracts/utils/StorageSlot.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @dev Collection of functions related to array types.
 */
library ArraySearch {
  using SlotDerivation for bytes32;
  using StorageSlot for bytes32;

  /**
   * @dev Searches an `array` sorted in ascending order and returns the first
   * index that contains a value strictly greater than `element`. If no such index
   * exists (i.e. all values in the array are strictly less than `element`), the array
   * length is returned. Time complexity O(log n).
   *
   * See C++'s https://en.cppreference.com/w/cpp/algorithm/upper_bound[upper_bound].
   */
  function upperBound(uint256[] storage array, uint256 element) internal view returns (uint256) {
    uint256 low = 0;
    uint256 high = array.length;

    if (high == 0) {
      return 0;
    }

    while (low < high) {
      uint256 mid = Math.average(low, high);

      // Note that mid will always be strictly less than high (i.e. it will be a valid array index)
      // because Math.average rounds towards zero (it does integer division with truncation).
      if (unsafeAccess(array, mid).value > element) {
        high = mid;
      } else {
        // this cannot overflow because mid < high
        unchecked {
          low = mid + 1;
        }
      }
    }

    return low;
  }

  /**
   * @dev Uses a `hint` to search an `array` sorted in ascending order and returns the first
   * index that contains a value strictly greater than `element`. If no such index
   * exists (i.e. all values in the array are strictly less than `element`), the array
   * length is returned. Time complexity O(log n).
   *
   * See C++'s https://en.cppreference.com/w/cpp/algorithm/upper_bound[upper_bound].
   */
  function upperBoundHint(uint256[] storage array, uint256 element, uint256 hint) internal view returns (uint256) {
    uint256 low = hint;
    uint256 high = array.length;

    if (high == 0) {
      return 0;
    }

    while (low < high) {
      uint256 mid = Math.average(low, high);

      // Note that mid will always be strictly less than high (i.e. it will be a valid array index)
      // because Math.average rounds towards zero (it does integer division with truncation).
      if (unsafeAccess(array, mid).value > element) {
        high = mid;
      } else {
        // this cannot overflow because mid < high
        unchecked {
          low = mid + 1;
        }
      }
    }

    return low;
  }

  /**
   * @dev Access an array in an "unsafe" way. Skips solidity "index-out-of-range" check.
   *
   * WARNING: Only use if you are certain `pos` is lower than the array length.
   */
  function unsafeAccess(uint256[] storage arr, uint256 pos) internal pure returns (StorageSlot.Uint256Slot storage) {
    bytes32 slot;
    assembly ("memory-safe") {
      slot := arr.slot
    }
    return slot.deriveArray().offset(pos).getUint256Slot();
  }
}
