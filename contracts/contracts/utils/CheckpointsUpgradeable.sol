// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.5.0) (utils/Checkpoints.sol)
pragma solidity ^0.8.0;

/**
 * CheckpointsUpgradeable - modified to use timestamps instead of block
 * numbers to match product requirements.
 *
 * Original: https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/cf68a02973de4a8745dc457a82d48ce238419980/contracts/utils/CheckpointsUpgradeable.sol
 */

import '@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol';

/**
 * @dev This library defines the `History` struct, for checkpointing values as
 * they change at different points in time, and later looking up past values
 * by block timestamp. See {Votes} as an example.
 *
 * To create a history of checkpoints define a variable type
 * `Checkpoints.History` in your contract, and store a new checkpoint for the
 * current transaction block using the {push} function.
 *
 * _Available since v4.5._
 */
library CheckpointsUpgradeable {
    struct Checkpoint {
        uint32 _timestamp;
        uint224 _value;
    }

    struct History {
        Checkpoint[] _checkpoints;
    }

    /**
     * @dev Returns the value in the latest checkpoint, or zero if there are
     * no checkpoints.
     */
    function latest(History storage self) internal view returns (uint256) {
        uint256 pos = self._checkpoints.length;
        return pos == 0 ? 0 : self._checkpoints[pos - 1]._value;
    }

    /**
     * @dev Returns the value at a given block timestamp. If a checkpoint is
     * not available at that block, the closest one before it is returned, or
     * zero otherwise.
     */
    function getAtTimestamp(History storage self, uint256 timestamp)
        internal
        view
        returns (uint256)
    {
        require(
            timestamp < block.timestamp,
            'Checkpoints: timestamp in the future'
        );

        uint256 high = self._checkpoints.length;
        uint256 low = 0;
        while (low < high) {
            uint256 mid = MathUpgradeable.average(low, high);
            if (self._checkpoints[mid]._timestamp > timestamp) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        return high == 0 ? 0 : self._checkpoints[high - 1]._value;
    }

    /**
     * @dev Pushes a value onto a History so that it is stored as the
     * checkpoint for the current block.
     *
     * Returns previous value and new value.
     */
    function push(History storage self, uint256 value)
        internal
        returns (uint256, uint256)
    {
        uint256 pos = self._checkpoints.length;
        uint256 old = latest(self);
        if (
            // slither-disable-next-line incorrect-equality
            pos > 0 && self._checkpoints[pos - 1]._timestamp == block.timestamp
        ) {
            self._checkpoints[pos - 1]._value = SafeCastUpgradeable.toUint224(
                value
            );
        } else {
            self._checkpoints.push(
                Checkpoint({
                    _timestamp: SafeCastUpgradeable.toUint32(block.timestamp),
                    _value: SafeCastUpgradeable.toUint224(value)
                })
            );
        }
        return (old, value);
    }

    /**
     * @dev Pushes a value onto a History, by updating the latest value using
     * binary operation `op`. The new value will be set to `op(latest, delta)`.
     *
     * Returns previous value and new value.
     */
    function push(
        History storage self,
        function(uint256, uint256) view returns (uint256) op,
        uint256 delta
    ) internal returns (uint256, uint256) {
        return push(self, op(latest(self), delta));
    }
}
