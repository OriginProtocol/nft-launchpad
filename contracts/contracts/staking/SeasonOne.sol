// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Context} from '@openzeppelin/contracts/utils/Context.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import {ISeason} from './ISeason.sol';
import {ISeries} from './Series.sol';
import {IStOGN} from './StOGN.sol';

/**
 * @title Season One Story staking contract
 */
contract SeasonOne is Context, ISeason {
    // Stored packed to save gas
    struct User {
        bool exists;
        uint128 points;
        uint128 claimedETH;
        uint128 claimedOGN;
    }

    // Stored packed to save gas
    struct SeasonStats {
        uint128 totalPoints;
        uint128 totalClaimedETH;
        uint128 totalClaimedOGN;
    }

    ISeries immutable series;

    uint256 public immutable override startTime;
    uint256 public immutable override endTime;
    uint256 public immutable override claimPeriod;
    uint256 public immutable override lockPeriod;

    bool private _bootstrapped = false;
    SeasonStats season;
    mapping(address => User) public users;

    address private constant ASSET_ETH =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /**
     * @dev User has staked
     * @param userAddress - address of the user
     * @param amount - amount of OGN staked
     * @param points - points user received for this statke
     */
    event Stake(
        address indexed userAddress,
        uint256 indexed amount,
        uint256 points
    );

    /**
     * @dev User has unstaked
     * @param userAddress - address of the user
     */
    event Unstake(address indexed userAddress);

    /**
     * @dev Rewards paid to the user
     * @param asset - address of the asset (or ASSET_ETH for ETH)
     * @param userAddress - address of the user
     * @param value - amount of ETH paid to the user
     */
    event RewardsPaid(
        address indexed asset,
        address indexed userAddress,
        uint256 value
    );

    /*
     * @param series_ - The Series registry
     * @param start_ - Timestamp starting this season
     * @param end_ - Timestamp ending this season
     * @param claimPeriod_ - Duration of the claim period (when users can
     *      claim profit share and rewards)
     * @param lockPeriod_ - Duration of the period at the end of the season
     *      when new stakes are no longer accepted.
     */
    constructor(
        address series_,
        uint256 start_,
        uint256 end_,
        uint256 claimPeriod_,
        uint256 lockPeriod_
    ) {
        series = ISeries(series_);
        startTime = start_;
        endTime = end_;

        // Conditionals to get around immutable compiler restrictions
        uint256 claim = claimPeriod_ > 0 ? claimPeriod_ : 45 days;
        claimPeriod = claim;
        uint256 lock = lockPeriod_ > 0 ? lockPeriod_ : 30 days;
        lockPeriod = lock;

        require(end_ > start_);
        // Points resolution is 1 day, so season must be more than that
        require(end_ - start_ > 1 days);
        // Season duration needs to be longer than the claimPeriod to allow
        // for rewards to be forwarded to the next season.
        require(end_ - start_ > claim);
        // Lock period is only a portion of the season duration
        require(end_ - start_ > lock);
    }

    // @dev only execute if season has been bootstrapped and is ready to go
    modifier ready() {
        // This should have been done before we got here
        require(_bootstrapped, 'SeasonTwo: Season not bootstrapped.');
        _;
    }

    // @dev only execute if season hasn't reach lock point
    modifier canStake() {
        require(
            block.timestamp < endTime - lockPeriod,
            'SeasonOne: Staking over'
        );
        _;
    }

    // @dev only execute if season is in claim period
    modifier inClaimPeriod() {
        require(_isClaimPeriod(), 'SeasonOne: Not claim period');
        _;
    }

    // @dev only execute if sender is the Series contract
    modifier onlySeries() {
        require(
            _msgSender() == address(series),
            'SeasonOne: Not series contract'
        );
        _;
    }

    ///
    /// Externals
    ///

    /*
     * @dev Calculate the points a user would receive if they staked at a
     *      specific block timestamp.
     * @param amount - The amount of OGN they would stake
     * @param blockStamp - The block timestamp to calculate for
     * @return points. 0 if out of season.
     */
    function pointsInTime(uint256 amount, uint256 blockStamp)
        external
        view
        returns (uint256)
    {
        return _pointsInTime(amount, blockStamp);
    }

    /*
     * @notice Total points
     * @return total points of all users
     */
    function getTotalPoints() external view override returns (uint128) {
        return season.totalPoints;
    }

    /*
     * @notice Total points for a user's stake
     * @param userAddress - address for which to return their points
     * @return total points
     */
    function getPoints(address userAddress)
        external
        view
        override
        returns (uint128)
    {
        IStOGN stOGN = IStOGN(series.stOGN());

        if (users[userAddress].exists) {
            return users[userAddress].points;
        } else {
            // Rolling over balances
            uint256 stOGNBalance = block.timestamp > startTime
                ? stOGN.balanceAt(userAddress, startTime)
                : stOGN.balanceOf(userAddress);

            return uint128(_pointsInTime(stOGNBalance, startTime));
        }
    }

    /**
     * @notice Return the expected rewards for a user.
     * @dev This will return zero values if outside the claim period.
     * @param userAddress - Address for the user to calculate
     * @return ethShare - Amount of ETH a user would receive if claimed now
     * @return ognRewards - Amount of OGN a user would receive if claimed now
     */
    function expectedRewards(address userAddress)
        external
        view
        override
        returns (uint256, uint256)
    {
        if (!_isClaimPeriod()) {
            return (0, 0);
        }

        User memory user = users[userAddress];

        uint256 ethShare = 0;

        // If we're still the current season, it means collection hasn't
        // happened because seasonFinale() hasn't happened.
        if (series.currentSeason() == address(this)) {
            // Make a best guess off of the vault balance if fees haven't
            // been collected yet.
            uint256 vaultBalance = series.vault().balance;
            uint256 ourBalance = address(this).balance;

            ethShare = _calculateShareOfETH(user, vaultBalance + ourBalance);
        } else {
            ethShare = _calculateProfitShare(user);
        }

        uint256 ognRewards = _calculateOGNReward(user);

        return (ethShare, ognRewards);
    }

    /**
     * @notice Is the season in the lock period?
     * @dev lock period is a period of time before season has ended where
     *      users may not add new stakes to the season.
     * @return bool if season is locked
     */
    function isLocked() external view override returns (bool) {
        return _isLocked();
    }

    /**
     * @notice Is the season ended?
     * @return bool if season is ended
     */
    function isEnded() external view override returns (bool) {
        return _isEnded();
    }

    /**
     * @notice Is the season in claim period?
     * @dev The claim period is after season has ended
     * @return bool if season is in claim period
     */
    function isClaimPeriod() external view override returns (bool) {
        return _isClaimPeriod();
    }

    /**
     * @dev Run any checks/mutations we might want handled before a staking
     * operation (stake/unstake/claim). This is currently making sure the
     * season and user has been initialized before doing any staking
     * operations.
     *
     * @param userAddress - the user staking their OGN
     */
    function before(address userAddress) external override onlySeries {
        _boostrap();
        _initUser(userAddress);
    }

    /**
     * @notice Stake OGN for a share of ETH profits and OGN rewards
     * @dev This may be called multiple times and the amount returned will
     *      be for the user's totals, not the amount for this specific call.
     *      The amount of the stake will be derived from the stOGN difference
     *      between now and the historical balance before now. -- stOGN should
     *      have been minted in the same tx before this has been called.
     *
     * @param userAddress - the user staking their OGN
     * @return total OGN staked
     * @return total points received for the user's stake
     */
    function stake(address userAddress)
        external
        override
        onlySeries
        ready
        canStake
        returns (uint128, uint128)
    {
        IStOGN stOGN = IStOGN(series.stOGN());

        // Get the amount we're staking now (the new amount of stOGN)
        uint256 amount = stOGN.balanceOf(userAddress) -
            stOGN.balanceAt(userAddress, block.timestamp - 1);

        require(amount > 0, 'SeasonOne: No incoming stOGN');

        // calculate stake points
        uint256 points = _pointsInTime(amount, block.timestamp);

        User memory user = _initUser(userAddress);

        // Load for gas savings
        SeasonStats memory stats = season;

        // Update user stake details
        user.points = uint128(user.points + points);

        // Store the updated user
        users[userAddress] = user;

        stats.totalPoints = uint128(stats.totalPoints + points);

        // Store the updated season
        season = stats;

        emit Stake(userAddress, amount, user.points);

        return (uint128(amount), user.points);
    }

    /**
     * @notice Claim ETH profit share and OGN rewards
     *
     * @param userAddress - User to claim share and rewards for
     * @return userRewardETH - Amount of ETH share sent to user
     * @return userRewardOGN - Amount of OGN rewards sent to user
     */
    function claimRewards(address userAddress)
        external
        override
        onlySeries
        ready
        inClaimPeriod
        returns (uint256, uint256)
    {
        // Handle rollover stake from a previous season.
        User memory user = _initUser(userAddress);

        // slither-disable-next-line incorrect-equality
        if (user.points == 0) {
            return (0, 0);
        }

        // Claim and transfer ETH profit share and OGN rewards
        return _claimRewards(userAddress, user);
    }

    /**
     * @notice Unstake all OGN.
     * @dev This will not pay out revenue share.  claimRewards() should be
     *      called before unstake by Series.
     *
     * @param userAddress - the user staking their OGN
     */
    function unstake(address userAddress) external override onlySeries ready {
        // Handle rollover stake from a previous season.
        User memory user = _initUser(userAddress);

        // Assert that the user has a stake
        require(user.points > 0, 'SeasonOne: No known stake points');

        // Load for gas savings
        SeasonStats memory stats = season;

        // Update totals, removing user stake
        // Do not remove points if season has ended to preserve shares
        if (!_isEnded()) {
            stats.totalPoints -= user.points;

            // Store season updates
            season = stats;
        }

        // Zero out storage user
        users[userAddress] = User(false, 0, 0, 0);

        emit Unstake(userAddress);
    }

    /**
     * @notice Refunds the vault any leftover unclaimed ETH royalties and
     *      sends OGN rewards to the next season. This will not touch users'
     *      OGN stakes.  They stay in stOGN until burned/unstaked.
     * @dev this can only be called after the claim period is over.
     */
    function wrapUp() external override ready {
        require(
            block.timestamp >= endTime + claimPeriod,
            'SeasonOne: Claim period not over'
        );

        // Init season if needed (very unlikely)
        _boostrap();

        IERC20 ogn = IERC20(series.ogn());

        // Send unclaimed ETH back to the vault
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            // transfer() does not send enough gas for a delegate call to an
            // empty receive() function.
            // slither-disable-next-line arbitrary-send
            (bool success, ) = payable(series.vault()).call{
                value: ethBalance,
                gas: 2700
            }('');
            require(success, 'SeasonOne: Transfer failed');
        }

        // Send leftover reward OGN to the next season
        uint256 ognBalance = ogn.balanceOf(address(this));

        if (ognBalance > 0) {
            address nextSeason = series.currentSeason();

            if (nextSeason != address(0) && nextSeason != address(this)) {
                require(
                    ogn.transfer(nextSeason, ognBalance),
                    'SeasonOne: OGN transfer failed'
                );
            }
        }
    }

    // @dev Allow this contract to receive ETH
    receive() external payable {}

    ///
    /// Internals
    ///

    /**
     * @dev Is the season in lock period?
     * @return true if yes
     */
    function _isLocked() internal view returns (bool) {
        return block.timestamp >= endTime - lockPeriod;
    }

    /**
     * @dev Has the season ended?
     * @return true if yes
     */
    function _isEnded() internal view returns (bool) {
        return block.timestamp >= endTime;
    }

    /**
     * @dev Are we in the claim period?
     * @return true if yes
     */
    function _isClaimPeriod() internal view returns (bool) {
        return
            block.timestamp >= endTime &&
            block.timestamp < endTime + claimPeriod;
    }

    /**
     * @dev Calculate the points a user would receive if they staked at a
     *      specific block timestamp.
     * @param amount - The amount of OGN they would stake
     * @param blockStamp - The block timestamp to calculate for
     * @return points
     */
    function _pointsInTime(uint256 amount, uint256 blockStamp)
        internal
        view
        returns (uint256)
    {
        // slither-disable-next-line incorrect-equality
        if (amount == 0 || blockStamp >= endTime) {
            return 0;
        }

        // Pre-season stakes
        uint256 effectiveStamp = blockStamp < startTime
            ? startTime
            : blockStamp;

        // Remainder ignored intentionally, only full days are counted
        uint256 stakeDays = (endTime - effectiveStamp) / 1 days;

        // Imprecise math intentional since resolution is only to 1 day
        // slither-disable-next-line divide-before-multiply
        return amount * stakeDays;
    }

    /**
     * @dev Claim and pay out ETH profit share and OGN rewards to the user
     *
     * @param userAddress - Address for the user we're claiming for
     * @param user - the User data for the user we're claiming for
     * @return userRewardETH - Amount of ETH share sent to user
     * @return userRewardOGN - Amount of OGN rewards sent to user
     */
    function _claimRewards(address userAddress, User memory user)
        internal
        returns (uint256, uint256)
    {
        uint256 userRewardOGN = _calculateOGNReward(user);
        uint256 userRewardETH = _calculateProfitShare(user);

        SeasonStats memory stats = season;

        // Update user and season totals
        user.claimedETH += uint128(userRewardETH);
        stats.totalClaimedETH += uint128(userRewardETH);
        user.claimedOGN += uint128(userRewardOGN);
        stats.totalClaimedOGN += uint128(userRewardOGN);

        // Store
        users[userAddress] = user;
        season = stats;

        if (userRewardETH > 0) {
            emit RewardsPaid(ASSET_ETH, userAddress, userRewardETH);

            // Transfer ETH profit share
            // slither-disable-next-line arbitrary-send
            payable(userAddress).transfer(userRewardETH);
        }

        if (userRewardOGN > 0) {
            IERC20 ogn = IERC20(series.ogn());

            emit RewardsPaid(address(ogn), userAddress, userRewardOGN);

            // Transfer reward OGN (ogn has known behavior)
            require(
                ogn.transfer(userAddress, userRewardOGN),
                'SeasonOne: Transfer failed'
            );
        }

        return (userRewardETH, userRewardOGN);
    }

    /**
     * @dev Initialize important season vars like total points, potentially
     *      rolling over stakes from the previous season.
     */
    function _boostrap() internal {
        // slither-disable-next-line incorrect-equality
        if (season.totalPoints == 0) {
            IStOGN stOGN = IStOGN(series.stOGN());

            uint256 initialSupply;

            // This will probably fire before startTime, but in case it
            // doesn't grab from historical stOGN checkpoint
            if (block.timestamp <= startTime) {
                initialSupply = stOGN.totalSupply();
            } else {
                initialSupply = stOGN.totalSupplyAt(startTime);
            }

            season.totalPoints = uint128(
                _pointsInTime(initialSupply, startTime)
            );

            _bootstrapped = true;
        }
    }

    /**
     * @dev Initialize a user, potentially rolling over stakes from the
     *      previous season.
     */
    function _initUser(address userAddress) internal returns (User memory) {
        User memory user = users[userAddress];

        // If the user is new, the user might be rolling over from a previous
        // season.  Check for stOGN at the time of season start.
        if (!user.exists) {
            IStOGN stOGN = IStOGN(series.stOGN());

            uint256 stOGNBalance = block.timestamp > startTime
                ? stOGN.balanceAt(userAddress, startTime)
                : stOGN.balanceOf(userAddress);

            // Calculate points at the start block when rolling over
            user.points = uint128(_pointsInTime(stOGNBalance, startTime));
            user.exists = true;

            // Store
            users[userAddress] = user;
        }

        return user;
    }

    /**
     * @dev Calculate the given user's share of known ETH profits
     *
     * @return amount of ETH the user is currently entitled to
     */
    function _calculateProfitShare(User memory user)
        internal
        view
        returns (uint256)
    {
        if (!_isClaimPeriod()) {
            return 0;
        }

        return _calculateShareOfETH(user, address(this).balance);
    }

    /**
     * @dev Calculate the given user's share of a given balance of ETH.
     *
     * @return amount of ETH the user is currently entitled to
     */
    function _calculateShareOfETH(User memory user, uint256 balance)
        internal
        view
        returns (uint256)
    {
        uint256 ethBalance = balance + season.totalClaimedETH;

        // slither-disable-next-line incorrect-equality
        return
            ethBalance == 0
                ? 0
                : ((ethBalance * uint256(user.points)) /
                    uint256(season.totalPoints)) - user.claimedETH;
    }

    /**
     * @dev Calculate the given user's share of any OGN rewards on this
     *      contract.  Any OGN sent directly here will become part of these
     *      rewards.
     *
     * @return amount of OGN the user is currently entitled to
     */
    function _calculateOGNReward(User memory user)
        internal
        view
        returns (uint256)
    {
        if (!_isClaimPeriod()) {
            return 0;
        }

        uint256 ognBalance = IERC20(series.ogn()).balanceOf(address(this)) +
            season.totalClaimedOGN;

        // slither-disable-next-line incorrect-equality
        return
            ognBalance == 0
                ? 0
                : (
                    ((ognBalance * uint256(user.points)) /
                        uint256(season.totalPoints))
                ) - user.claimedOGN;
    }
}
