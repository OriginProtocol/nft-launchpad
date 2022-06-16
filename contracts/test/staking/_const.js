module.exports = {
  REWARDS_PAID_TOPIC: ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('RewardsPaid(address,address,uint256)')
  ),
  REWARDS_SENT_TOPIC: ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('RewardsSent(address,address,uint256)')
  ),
  NEW_CONTROLLER_TOPIC: ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('NewController(address)')
  ),
  // Unstake(address indexed userAddress)
  UNSTAKE_TOPIC: ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('Unstake(address)')
  ),
  // RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)
  ROLE_GRANTED_TOPIC: ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('RoleGranted(bytes32,address,address)')
  ),
  // RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)
  ROLE_REVOKED_TOPIC: ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('RoleRevoked(bytes32,address,address)')
  ),
  // RewardsCollected(uint256 amount)
  REWARDS_COLLECTED_TOPIC: ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('RewardsCollected(uint256)')
  ),
  MINTER_ROLE: ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE')),
  MINTER_ADMIN_ROLE: ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes('MINTER_ADMIN_ROLE')
  ),
  ASSET_ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  ASSET_ETH_TOPIC:
    '0x000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
}
