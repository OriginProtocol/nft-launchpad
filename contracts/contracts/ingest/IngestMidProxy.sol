// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/Proxy.sol";
import "./IngestRegistry.sol";

contract IngestMidProxy is Proxy {
    IngestRegistry constant registry =
        IngestRegistry(0xFFbebEbeBEbeBeBEBeBebeBEbeBebebEAAaAaAAA);

    function _implementation() internal view override returns (address) {
        return registry.endpointImplimentation();
    }
}
