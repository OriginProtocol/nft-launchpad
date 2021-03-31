// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../governance/Governable.sol";

contract IngestRegistry is Governable {
    address public endpointImplimentation;
    address public master;
    address public pool;

    event NewEndpointImplimentation(
        address indexed newCollector,
        address indexed oldCollector
    );

    event NewMaster(address indexed newMaster, address indexed oldMaster);

    event NewPool(address indexed newPool, address indexed oldPool);

    function setEndpointImplimentation(address addr) external onlyGovernor {
        emit NewEndpointImplimentation(addr, endpointImplimentation);
        endpointImplimentation = addr;
    }

    function setMaster(address addr) external onlyGovernor {
        emit NewMaster(addr, master);
        master = addr;
    }

    function setPool(address addr) external onlyGovernor {
        emit NewPool(addr, pool);
        pool = addr;
    }
}
