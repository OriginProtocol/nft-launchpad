// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISeason {
    function claimPeriod() external view returns (uint256);

    function lockPeriod() external view returns (uint256);

    function endTime() external view returns (uint256);

    function startTime() external view returns (uint256);

    function getTotalPoints() external view returns (uint128);

    function getPoints(address userAddress) external view returns (uint128);

    function expectedRewards(address userAddress)
        external
        view
        returns (uint256, uint256);

    function isLocked() external view returns (bool);

    function isEnded() external view returns (bool);

    function isClaimPeriod() external view returns (bool);

    function before(address userAddress) external;

    function claimRewards(address userAddress)
        external
        returns (uint256, uint256);

    function stake(address userAddress) external returns (uint128, uint128);

    function unstake(address userAddress) external;

    function wrapUp() external;
}
