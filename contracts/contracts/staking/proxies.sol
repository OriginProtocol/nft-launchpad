// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GovernedUpgradeabilityProxy} from '../governance/GovernedUpgradeabilityProxy.sol';

/**
 * @notice FeeVaultProxy
 */
contract FeeVaultProxy is GovernedUpgradeabilityProxy {
    constructor(address _logic, address _series)
        GovernedUpgradeabilityProxy(
            _logic,
            abi.encodeWithSignature('initialize(address)', _series)
        )
    {}
}

/**
 * @notice StOGNProxy
 */
contract StOGNProxy is GovernedUpgradeabilityProxy {
    constructor(
        address _logic,
        address _ogn,
        address _minter
    )
        GovernedUpgradeabilityProxy(
            _logic,
            abi.encodeWithSignature(
                'initialize(address,address)',
                _ogn,
                _minter
            )
        )
    {}
}

/**
 * @notice SeriesProxy
 */
contract SeriesProxy is GovernedUpgradeabilityProxy {
    constructor(
        address _logic,
        address _ogn,
        address _stOGN,
        address _vault
    )
        GovernedUpgradeabilityProxy(
            _logic,
            abi.encodeWithSignature(
                'initialize(address,address,address)',
                _ogn,
                _stOGN,
                _vault
            )
        )
    {}
}
