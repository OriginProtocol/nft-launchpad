// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * This contract used to test against a potential exploit that allows an
 * attacker to gain more points than they're entitled to.  It does this by
 * staking multiple times in a block exploiting the way staking amounts are
 * calculated.
 */

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import {ISeason} from '../ISeason.sol';
import {ISeries} from '../Series.sol';

contract SeasonPointsAttack {
    ISeries public series;
    ISeason public season;
    IERC20 public ogn;

    constructor(address series_, address ogn_) {
        series = ISeries(series_);
        ogn = IERC20(ogn_);
        season = ISeason(series.currentSeason());
    }

    function execute() external {
        // Let Series manhandle our OGN
        ogn.approve(address(series), type(uint256).max);

        uint256 ognBalance = ogn.balanceOf(address(this));

        require(ognBalance > 0, 'SeasonPointsAttack: No OGN balance');

        uint256 expectedTotalPoints = season.pointsInTime(
            ognBalance,
            season.startTime()
        );

        // We're going to send one of our full balance and each of the 5
        // subsequent  stake will be 1 OGN
        uint256 initial = ognBalance - 5e18;

        (uint256 stakedOGN, uint256 stakePoints) = series.stake(initial);

        uint256 totalStakedOGN;
        uint256 totalStakePoints;

        for (uint256 i = 0; i < 5; i++) {
            (uint256 _ogn, uint256 _points) = series.stake(1e18);
            totalStakedOGN = _ogn;
            totalStakePoints = _points;
        }

        require(
            totalStakedOGN == ognBalance,
            'SeasonPointsAttack: Unexpected OGN balance'
        );
        // This is asserting invalid points totals.  It should revert if
        // things are working correctly. It should be only the amount of
        // points for 1m OGN at the start of the season
        require(
            totalStakePoints > expectedTotalPoints,
            'SeasonPointsAttack: Unexpected points totals'
        );
    }
}
