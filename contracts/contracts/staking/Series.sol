// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AddressUpgradeable as Address} from '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import {Context} from '@openzeppelin/contracts/utils/Context.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {IERC20Upgradeable as IERC20} from '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';

import {Governable} from '../governance/Governable.sol';
import {IFeeVault} from './FeeVault.sol';
import {ISeason} from './ISeason.sol';
import {IStOGN} from './StOGN.sol';

interface ISeries {
    function ogn() external view returns (address);

    function stOGN() external view returns (address);

    function vault() external view returns (address);

    function hasActiveSeason() external view returns (bool);

    function currentSeason() external view returns (address);

    function nextSeason() external view returns (address);

    function previousSeason() external view returns (address);

    function claimRewards(address userAddress)
        external
        returns (uint256, uint256);

    function stake(uint256 amount) external returns (uint256, uint256);

    function unstake() external returns (uint256);

    function popSeason() external;

    function pushSeason(address season) external;
}

contract Series is Context, Initializable, Governable, ISeries {
    address public override vault;
    address public override ogn;
    address public override stOGN;

    address[] public seasons;
    uint256 public activeSeason;

    bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');

    /**
     * @dev A new season has been registered
     * @param number - The season ID (1-indexed)
     * @param season - The address of the new season
     */
    event NewSeason(uint256 indexed number, address indexed season);

    /**
     * @dev A season has started
     * @param number - The season ID (1-indexed)
     * @param season - The address of the new season
     */
    event SeasonStart(uint256 indexed number, address indexed season);

    /**
     * @dev A season has ended
     * @param number - The season ID (1-indexed)
     * @param season - The address of the new season
     */
    event SeasonFinale(uint256 indexed number, address indexed season);

    /**
     * @dev A season has been cancelled and removed
     * @param season - The address of the new season
     */
    event SeasonCancelled(address indexed season);

    // @dev only execute if contract is fully setup
    modifier addressesSet() {
        require(stOGN != address(0), 'Series: stOGN not set');
        require(vault != address(0), 'Series: vault not set');
        _;
    }

    // @dev only execute if there's an active season set
    modifier requireActiveSeason() {
        require(_hasActiveSeason(), 'Series: No active season');
        _;
    }

    /**
     * @param ogn_ - Address for the OGN token
     * @param stOGN_ - Address for the stOGN token
     * @param vault_ - Address for the FeeVault
     */
    function initialize(
        address ogn_,
        address stOGN_,
        address vault_
    ) external initializer {
        require(ogn_ != address(0), 'Series: Zero address: OGN');
        ogn = ogn_;

        // These are likely to be zero on initial deploy due to dependency
        // ordering.
        stOGN = stOGN_;
        vault = vault_;
    }

    ///
    /// Externals
    ///

    /**
     * @notice Is there a season that is currently active?
     * @return true if yes
     */
    function hasActiveSeason() external view override returns (bool) {
        return _hasActiveSeason();
    }

    /**
     * @notice The current active season (zero address if none)
     * @return address of the currently set active season (or zero address)
     */
    function currentSeason() public view override returns (address) {
        return seasons.length > 0 ? seasons[activeSeason] : address(0);
    }

    /**
     * @notice The next scheduled season (zero address if none)
     * @return address of the next consecutive season (or zero address)
     */
    function nextSeason() public view override returns (address) {
        return
            activeSeason < seasons.length - 1
                ? seasons[activeSeason + 1]
                : address(0);
    }

    /**
     * @notice The next scheduled season (zero address if none)
     * @return address of the previous season (or zero address)
     */
    function previousSeason() public view override returns (address) {
        return activeSeason > 0 ? seasons[activeSeason - 1] : address(0);
    }

    /**
     * @notice Set the address for the OGN token.
     * @dev other contracts reference this value as well
     * @param ogn_ - address for the contract
     */
    function setOGN(address ogn_) external onlyGovernor {
        require(ogn_ != address(0), 'Series: Zero address: OGN');
        ogn = ogn_;
    }

    /**
     * @notice Set the address for the stOGN token.
     * @dev other contracts reference this value as well
     * @param stOGN_ - address for the contract
     */
    function setStOGN(address stOGN_) external onlyGovernor {
        require(stOGN_ != address(0), 'Series: Zero address: stOGN');
        stOGN = stOGN_;
    }

    /**
     * @notice Set the address for the FeeVault.
     * @dev other contracts reference this value as well
     * @param vault_ - address for the contract
     */
    function setVault(address vault_) external onlyGovernor {
        require(vault_ != address(0), 'Series: Zero address: FeeVault');
        vault = vault_;
    }

    /**
     * @notice Stake OGN for fee sharing and rewards. Users can call this
     *      multiple times to add to their stake.
     *
     * @param amount - The amount of OGN to stake
     * @return total amount of OGN staked by the user
     * @return total points received for the user's stake
     */
    function stake(uint256 amount)
        external
        override
        addressesSet
        requireActiveSeason
        returns (uint256, uint256)
    {
        require(amount > 0, 'Series: No stake amount');

        address userAddress = _msgSender();
        IERC20 token = IERC20(ogn);
        IStOGN sToken = IStOGN(stOGN);
        ISeason season = _acquireSeason(userAddress);

        // OGN approval maintenance, likely only once
        if (token.allowance(address(this), address(stOGN)) < amount) {
            require(
                token.approve(address(stOGN), type(uint256).max),
                'Series: OGN approval failed'
            );
        }

        // Transfer OGN to Series and mint stOGN for the user
        require(
            token.transferFrom(userAddress, address(this), amount),
            'Series: OGN transfer failed'
        );

        uint128 ognStaked;
        uint128 stakePoints;

        // If the season is locked, we cannot stake to it
        if (!season.isLocked()) {
            sToken.mint(userAddress, amount);
            (ognStaked, stakePoints) = season.stake(userAddress);
        }
        // But we may be able to pre-stake to the next season
        else {
            require(
                activeSeason < seasons.length - 1,
                'Series: No available season for staking'
            );

            uint256 nextIdx = activeSeason + 1;
            ISeason next = ISeason(seasons[nextIdx]);

            // before() usually called in _acquireSeason() but we need to
            // manually call it since we aren't using it here.
            next.before(userAddress);

            require(!next.isEnded(), 'Series: Next season ended');

            // No reason next season should finale at this point. If it does,
            // it could cause some issues.
            require(
                activeSeason != nextIdx,
                'Series: Unexpected season change'
            );

            // This needs to happen after the before() call above, since
            // before() may use stOGN totals for points rollover
            sToken.mint(userAddress, amount);

            // Stake in next season
            (ognStaked, stakePoints) = next.stake(userAddress);
        }

        return (ognStaked, stakePoints);
    }

    /**
     * @notice Unstake previously staked OGN. This will unstake their full
     *      OGN stake amount.
     *
     * @return amount of OGN unstaked
     */
    function unstake()
        external
        override
        addressesSet
        requireActiveSeason
        returns (uint256)
    {
        address userAddress = _msgSender();
        IStOGN sToken = IStOGN(stOGN);
        ISeason season = _acquireSeason(userAddress);

        uint256 amount = sToken.balanceOf(userAddress);

        // All potentially in-play seasons. The potential states being:
        // locked, active, pre-stake.  Though never all at once.
        address[3] memory relevant = [
            previousSeason(),
            address(season),
            nextSeason()
        ];

        // Unstake from all potentially relevant seasons
        for (uint256 i = 0; i < relevant.length; i++) {
            if (relevant[i] != address(0)) {
                ISeason relevantSeason = ISeason(relevant[i]);

                // _acquireSeason() would have called this for the active
                if (relevant[i] != address(season)) {
                    relevantSeason.before(userAddress);
                }

                if (relevantSeason.isClaimPeriod()) {
                    // slither-disable-next-line unused-return
                    relevantSeason.claimRewards(userAddress);
                }

                if (
                    !relevantSeason.isEnded() &&
                    relevantSeason.getPoints(userAddress) > 0
                ) {
                    relevantSeason.unstake(userAddress);
                }
            }
        }

        // Burn stOGN, which sends staked OGN to the user
        sToken.burnTo(userAddress, userAddress, amount);

        return amount;
    }

    function claimRewards(address userAddress)
        external
        override
        addressesSet
        requireActiveSeason
        returns (uint256, uint256)
    {
        ISeason season = _acquireSeason(userAddress);

        uint256 claimedETH = 0;
        uint256 claimedOGN = 0;

        // Likely only the last season is in claim period, but a chance we
        // let the series end (or start next delayed) so this season may be
        // the one in claim period.
        address[2] memory relevant = [previousSeason(), address(season)];

        for (uint256 i = 0; i < relevant.length; i++) {
            if (relevant[i] != address(0)) {
                ISeason relevantSeason = ISeason(relevant[i]);

                // _acquireSeason() would have called this for the active
                if (relevant[i] != address(season)) {
                    relevantSeason.before(userAddress);
                }

                if (relevantSeason.isClaimPeriod()) {
                    (uint256 _eth, uint256 _ogn) = relevantSeason.claimRewards(
                        userAddress
                    );
                    claimedETH += _eth;
                    claimedOGN += _ogn;
                }
            }
        }

        return (claimedETH, claimedOGN);
    }

    /**
     * @notice Start the next season.
     * @dev This should be a pretty exceptional call to make and should not be
     *      part of the normal lifecycle
     */
    function seasonStart() external onlyGovernor {
        _startNext();

        emit SeasonStart(activeSeason, currentSeason());
    }

    /**
     * @notice Add a new season.  It will be the "next" season
     * @param season - address for the new season
     */
    function pushSeason(address season) external override onlyGovernor {
        require(Address.isContract(season), 'Series: Season not a contract');

        seasons.push(season);

        emit NewSeason(seasons.length - 1, season);

        if (seasons.length == 1) {
            emit SeasonStart(activeSeason, season);
        }
    }

    /**
     * @notice Cancel the final scheduled season.
     */
    function popSeason() external override onlyGovernor requireActiveSeason {
        uint256 finalSeason = seasons.length - 1;

        require(seasons.length > 0, 'Series: No seasons to cancel');
        require(
            activeSeason < seasons.length - 1,
            'Series: Cannot cancel active season'
        );

        address cancelled = seasons[finalSeason];

        // Remove the last element
        seasons.pop();

        emit SeasonCancelled(cancelled);
    }

    ///
    /// Internals
    ///

    /**
     * @dev Do we have an active season that can be staked in?
     * @return true if yes
     */
    function _hasActiveSeason() internal view returns (bool) {
        return seasons.length > 0 && currentSeason() != address(0);
    }

    /**
     * @dev called by the current season to indicate it has ended. This will
     *      also kick off the next season if it exists.
     */
    function _seasonFinale() internal {
        // Collect rewards to Season
        IFeeVault(vault).collectRewards();

        emit SeasonFinale(activeSeason, currentSeason());

        // If we let the finale happen without a next season ready to go, the
        // governor will need to add a new season newSeason(), and call
        // seasonStart() to kick off the next manually.
        if (nextSeason() != address(0)) {
            _startNext();

            emit SeasonStart(activeSeason, currentSeason());
        }
    }

    /**
     * @dev Fetches the active season, calling before() on each, which
     *      potentially causes a finale and new season start.
     * @param userAddress - address for the user we're operating on
     * @return season instance for the active season
     */
    function _acquireSeason(address userAddress) internal returns (ISeason) {
        ISeason season = ISeason(currentSeason());
        uint256 initial = activeSeason;

        if (season.isEnded()) {
            _seasonFinale();

            // _seasonFinale() may have started the next season
            if (activeSeason != initial) {
                season = ISeason(currentSeason());
            }
        }

        season.before(userAddress);

        return season;
    }

    /**
     * @dev Start the next season.  This will fail if there's no next season.
     */
    function _startNext() internal {
        require(
            activeSeason < seasons.length - 1,
            'Series: No next season set'
        );
        activeSeason += 1;
    }
}
