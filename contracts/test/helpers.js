const hre = require('hardhat')
const { createFixtureLoader } = require('ethereum-waffle')
const { expect } = require('chai')

const loadFixture = createFixtureLoader(
  [
    hre.ethers.provider.getSigner(0),
    hre.ethers.provider.getSigner(1),
    hre.ethers.provider.getSigner(2),
    hre.ethers.provider.getSigner(3),
    hre.ethers.provider.getSigner(4),
    hre.ethers.provider.getSigner(5),
    hre.ethers.provider.getSigner(6),
    hre.ethers.provider.getSigner(7),
    hre.ethers.provider.getSigner(8),
    hre.ethers.provider.getSigner(9)
  ],
  hre.ethers.provider
)

const getGas = async (tx) => {
  const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
  return receipt.gasUsed.toString()
}

async function getSigForMintV5({
  signer,
  token,
  buyer,
  count,
  price,
  mintLimit,
  expires
}) {
  const net = await ethers.provider.getNetwork()

  const hash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        'uint',
        'address',
        'address',
        'address',
        'uint256',
        'uint256',
        'uint256',
        'uint256'
      ],
      [
        net.chainId,
        token.address,
        buyer,
        buyer,
        count,
        price,
        mintLimit,
        expires
      ]
    )
  )
  return await signer.signMessage(ethers.utils.arrayify(hash))
}

const expectSuccess = async (tx, confirms = 1) => {
  if (tx instanceof Promise) {
    tx = await tx
  }
  const receipt = await tx.wait(confirms)
  expect(receipt.status).to.equal(1)
  return receipt
}

function toHexString(num) {
  return `0x${num.toString(16)}`
}

/**
 * Take a chain snapshot to rollback to
 * @return snapshot ID that can be given to rollback()
 */
async function snapshot() {
  return await hre.network.provider.send('evm_snapshot', [])
}

/**
 * Rollback to a previous snapshot
 * @param snapshot ID to roll back to
 */
async function rollback(snapshotId) {
  return await hre.network.provider.send('evm_revert', [snapshotId])
}

async function mineBlocks(numBlocks) {
  // args are blocks and time between blocks in seconds
  await hre.network.provider.send('hardhat_mine', [
    toHexString(numBlocks),
    '0x1'
  ])
}

async function mineUntilBlock(untilBlock) {
  while (untilBlock > (await ethers.provider.getBlockNumber())) {
    await mineBlocks(1)
  }
}

async function mineUntilTime(untilTimestamp) {
  const block = await ethers.provider.getBlock()
  const diff = untilTimestamp - block.timestamp

  if (diff < 1) {
    throw new Error(`Cannot mine into the past.`)
  }

  const span = diff > 10 ? Math.ceil(diff / 10) : diff
  const blocks = diff > 10 ? 10 : 1

  await hre.network.provider.send('hardhat_mine', [
    toHexString(blocks + 1),
    toHexString(span)
  ])
}

async function blockStamp(number) {
  return (await ethers.provider.getBlock(number)).timestamp
}

async function createUser(signer) {
  return {
    txFees: ethers.BigNumber.from(0),
    signer,
    address: await signer.getAddress(),
    originalBalanceETH: await signer.getBalance(),
    originalBalanceOGN: ethers.BigNumber.from(0)
  }
}

async function allowToken(token, account, spenderAddress, amount) {
  return await token.connect(account).approve(spenderAddress, amount)
}

async function fundToken(token, fromAccount, toAddress, amount) {
  return await token.connect(fromAccount).mint(toAddress, amount)
}

// Use a counter for random addresses to ensure they are unique.
// Without it this produces duplicates when ran within the same millisecond.
let randomAddressCounter = +new Date()
function randomAddress() {
  return ethers.utils.getAddress(
    ethers.utils
      .keccak256(ethers.utils.toUtf8Bytes(`${randomAddressCounter++}`))
      .slice(0, 42)
  )
}

const ONE_ETH = ethers.utils.parseEther('1')
const ONE_OGN = ONE_ETH
const ONE_THOUSAND_OGN = ONE_OGN.mul(1000)
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const BURN_ADDRESS = '0x0000000000000000000000000000000000000001'
const DUST = ethers.BigNumber.from('1200000000000000') // 0.0012e18

function roughlyEqual(a, b) {
  const diff = a.sub(b).abs()
  return diff.lt(DUST)
}

module.exports = {
  BURN_ADDRESS,
  ONE_ETH,
  ONE_OGN,
  ONE_THOUSAND_OGN,
  ZERO_ADDRESS,
  allowToken,
  blockStamp,
  createUser,
  expectSuccess,
  fundToken,
  getGas,
  loadFixture,
  getSigForMintV5,
  mineBlocks,
  mineUntilBlock,
  mineUntilTime,
  randomAddress,
  roughlyEqual,
  snapshot,
  rollback
}
