// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import {AddressUpgradeable as Address} from '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';

import {Governable} from '../governance/Governable.sol';
import {ISeries} from './Series.sol';

interface IFeeVault {
    function currentSeason() external view returns (address);

    function collectRewards() external;

    function pause() external;

    function unpause() external;

    function recoverERC20(
        address tokenAddress,
        uint256 tokenAmount,
        address toAddress
    ) external;

    function setSeries(address seriesAddress) external;
}

contract FeeVault is Initializable, Governable, PausableUpgradeable, IFeeVault {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    ISeries public series;

    // @dev Rewards have been sent to the season
    event RewardsCollected(uint256 amount);

    // @dev only execute if sender is current season
    modifier onlySeason() {
        require(msg.sender == _currentSeason(), 'FeeVault: Invalid sender');
        _;
    }

    /**
     * @param seriesAddress - Address for the Series
     */
    function initialize(address seriesAddress) external initializer {
        __Pausable_init();
        series = ISeries(seriesAddress);
    }

    ///
    /// Externals
    ///

    function currentSeason() external view override returns (address) {
        return _currentSeason();
    }

    /**
     * @notice Send rewards to season contract to be claimed
     * @dev Anyone can call this at any time (when not paused)
     */
    function collectRewards() external override whenNotPaused {
        _collectRewards();
    }

    /**
     * @notice Recover ERC20 tokens sent to contract.  This can only be called
     *      by the governor.
     * @param tokenAddress - address of the token to recover
     * @param tokenAmount - amount of the token to recover
     * @param toAddress - address of the recipient of the tokens
     */
    function recoverERC20(
        address tokenAddress,
        uint256 tokenAmount,
        address toAddress
    ) external override onlyGovernor whenNotPaused {
        IERC20Upgradeable(tokenAddress).safeTransfer(toAddress, tokenAmount);
    }

    /**
     * @notice Set series address
     */
    function setSeries(address seriesAddress) external override onlyGovernor {
        series = ISeries(seriesAddress);
    }

    /**
     * @notice Pause all funds movement functionality
     */
    function pause() external override onlyGovernor {
        _pause();
    }

    /**
     * @notice Pause all funds movement functionality
     */
    function unpause() external override onlyGovernor {
        _unpause();
    }

    // @dev Allow this contract to receive ETH
    receive() external payable {}

    ///
    /// Internals
    ///

    /**
     * @dev Get the current series
     */
    function _currentSeason() internal view returns (address) {
        return
            address(series) == address(0) ? address(0) : series.currentSeason();
    }

    /**
     * @dev Collect rewards to the active season
     */
    function _collectRewards() internal {
        require(_currentSeason() != address(0), 'FeeVault: No active season');

        uint256 balance = address(this).balance;

        if (balance > 0) {
            emit RewardsCollected(balance);

            // Send all ETH to season
            // slither-disable-next-line arbitrary-send
            payable(_currentSeason()).transfer(balance);
        }
    }
}
