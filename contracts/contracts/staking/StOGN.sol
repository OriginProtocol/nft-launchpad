// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAccessControlUpgradeable} from '@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol';
import {AddressUpgradeable as Address} from '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import {ContextUpgradeable} from '@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol';
import {ERC20Upgradeable} from '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IERC20Upgradeable} from '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import {Initializable} from '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import {PausableUpgradeable} from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import {SafeERC20Upgradeable as SafeERC20} from '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import {AccessControlGovernableUpgradeable} from '../governance/AccessControlGovernableUpgradeable.sol';
import {Governable} from '../governance/Governable.sol';
import {CheckpointsUpgradeable as Checkpoints} from '../utils/CheckpointsUpgradeable.sol';

interface IStOGN is IERC20Upgradeable, IAccessControlUpgradeable {
    function balanceAt(address account, uint256 timestamp)
        external
        view
        returns (uint256);

    function totalSupplyAt(uint256 timestamp) external view returns (uint256);

    function mint(address account, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function burnTo(
        address account,
        address to,
        uint256 amount
    ) external;
}

contract StOGN is
    Initializable,
    ContextUpgradeable,
    Governable,
    PausableUpgradeable,
    AccessControlGovernableUpgradeable,
    ERC20Upgradeable,
    IStOGN
{
    IERC20 public ogn;

    Checkpoints.History private supplyCheckpoints;
    mapping(address => Checkpoints.History) private userCheckpoints;

    // Does not matter if this gets overwritten in an upgrade
    bytes32 public constant MINTER_ROLE = keccak256('MINTER_ROLE');

    // @dev make a user checkpoint after the method was executed
    modifier userCheckpointAfter(address account) {
        _;
        _userCheckpoint(account);
    }

    // @dev make a total supply checkpoint after the method was executed
    modifier supplyCheckpointAfter() {
        _;
        _supplyCheckpoint();
    }

    /**
     * @param ogn_ - Address for OGN token
     * @param minter_ - Address to grant mint permissions.
     */
    function initialize(address ogn_, address minter_) external initializer {
        __Pausable_init();
        __AccessControl_init();
        __ERC20_init('Staked OGN', 'StOGN');

        ogn = IERC20(ogn_);

        // Deployer gets to be default admin
        // NOTE: Governor also gets the same perms as default admin
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _grantRole(MINTER_ROLE, minter_ == address(0) ? _msgSender() : minter_);
    }

    ///
    /// Externals
    ///

    /**
     * @dev Return the balance of an account at a given time, reading from
     *      Checkpoints.
     */
    function balanceAt(address account, uint256 timestamp)
        external
        view
        virtual
        override
        returns (uint256)
    {
        return Checkpoints.getAtTimestamp(userCheckpoints[account], timestamp);
    }

    /**
     * @dev Return the balance of an account at a given time, reading from
     *      Checkpoints.
     */
    function totalSupplyAt(uint256 timestamp)
        external
        view
        virtual
        override
        returns (uint256)
    {
        return Checkpoints.getAtTimestamp(supplyCheckpoints, timestamp);
    }

    /**
     * @notice Mint StOGN using sender's OGN
     * @param account - Address for account receiving StOGN
     * @param amount - Amount of StOGN to mint and OGN to wrap
     */
    function mint(address account, uint256 amount)
        external
        override
        whenNotPaused
        onlyRole(MINTER_ROLE)
        userCheckpointAfter(account)
        supplyCheckpointAfter
    {
        require(
            ogn.transferFrom(_msgSender(), address(this), amount),
            'StOGN: OGN transfer failed'
        );
        _mint(account, amount);
    }

    /**
     * @notice Burn StOGN sending OGN to account
     * @param account - Address for account losing StOGN
     * @param amount - Amount of StOGN to burn and OGN to unwrap
     */
    function burn(address account, uint256 amount)
        external
        override
        whenNotPaused
        onlyRole(MINTER_ROLE)
        userCheckpointAfter(account)
        supplyCheckpointAfter
    {
        _burnTo(account, _msgSender(), amount);
    }

    /**
     * @notice Burn StOGN sending OGN to specific account
     * @param account - Address for account losing StOGN
     * @param to - Address for account receiving OGN
     * @param amount - Amount of StOGN to burn and OGN to unwrap
     */
    function burnTo(
        address account,
        address to,
        uint256 amount
    )
        external
        override
        whenNotPaused
        onlyRole(MINTER_ROLE)
        userCheckpointAfter(account)
        supplyCheckpointAfter
    {
        _burnTo(account, to, amount);
    }

    /**
     * @notice Transfer StOGN
     * @dev Regular users may not call this.  Same as ERC20Upgradeable's
     *      implementation with the addition of a permission modifier.
     * @param recipient - Address for account receiving StOGN
     * @param amount - Amount of StOGN to transfer
     *
     * WARNING: As of this writing, Seasons are unable to cope with these
     * transfers.  If a user was given points, then this transfer is called,
     * their points will remain.  If we want to open up these permissions,
     * Seasons will need to be made aware of these transfers.
     */
    function transfer(address recipient, uint256 amount)
        public
        override(ERC20Upgradeable, IERC20Upgradeable)
        whenNotPaused
        onlyRole(MINTER_ROLE)
        userCheckpointAfter(recipient)
        userCheckpointAfter(_msgSender())
        returns (bool)
    {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    /**
     * @notice Transfer StOGN
     * @dev Regular users may not call this.  Same as ERC20Upgradeable's
     *      implementation with the addition of a permission modifier.
     * @param sender - Address for account sending StOGN
     * @param recipient - Address for account receiving StOGN
     * @param amount - Amount of StOGN to transfer
     *
     * WARNING: As of this writing, Seasons are unable to cope with these
     * transfers.  If a user was given points, then this transfer is called,
     * their points will remain.  If we want to open up these permissions,
     * Seasons will need to be made aware of these transfers.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    )
        public
        override(ERC20Upgradeable, IERC20Upgradeable)
        whenNotPaused
        onlyRole(MINTER_ROLE)
        userCheckpointAfter(sender)
        userCheckpointAfter(recipient)
        returns (bool)
    {
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = allowance(sender, _msgSender());
        require(
            currentAllowance >= amount,
            'ERC20: transfer amount exceeds allowance'
        );
        unchecked {
            _approve(sender, _msgSender(), currentAllowance - amount);
        }

        return true;
    }

    /**
     * Since OZ's ERC20Upgradeable defines this with functionality, we're
     * going to kill them for the time being.  They may be implemented later.
     */

    function approve(address spender, uint256 amount)
        public
        virtual
        override(ERC20Upgradeable, IERC20Upgradeable)
        whenNotPaused
        returns (bool)
    {
        require(spender != address(0));
        require(amount != 0);
        revert('NOT IMPLEMENTED');
    }

    function increaseAllowance(address spender, uint256 addedValue)
        public
        virtual
        override(ERC20Upgradeable)
        whenNotPaused
        returns (bool)
    {
        require(spender != address(0));
        require(addedValue != 0);
        revert('NOT IMPLEMENTED');
    }

    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        virtual
        override(ERC20Upgradeable)
        whenNotPaused
        returns (bool)
    {
        require(spender != address(0));
        require(subtractedValue != 0);
        revert('NOT IMPLEMENTED');
    }

    /**
     * @notice Pause this contract
     */
    function pause() external onlyGovernor {
        _pause();
    }

    /**
     * @notice Unpause this contract
     */
    function unpause() external onlyGovernor {
        _unpause();
    }

    ///
    /// Internals
    ///

    /**
     * @dev Burn StOGN sending OGN to specific account
     * @param account - Address for account losing StOGN
     * @param to - Address for account receiving OGN
     * @param amount - Amount of StOGN to burn and OGN to unwrap
     */
    function _burnTo(
        address account,
        address to,
        uint256 amount
    ) internal {
        _burn(account, amount);
        require(ogn.transfer(to, amount), 'StOGN: OGN transfer failed');
    }

    /**
     * @dev Create a totalSupply checkpoint
     */
    function _supplyCheckpoint() internal {
        // slither-disable-next-line unused-return
        Checkpoints.push(supplyCheckpoints, totalSupply());
    }

    /**
     * @dev Create a balance checkpoint for a specific account
     */
    function _userCheckpoint(address account) internal {
        // slither-disable-next-line unused-return
        Checkpoints.push(userCheckpoints[account], balanceOf(account));
    }
}
