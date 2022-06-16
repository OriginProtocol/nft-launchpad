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
  if (num instanceof ethers.BigNumber) {
    return num.toHexString()
  }

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
  // Sadly, we are unable to use hardhat_mine because it does not currently
  // work with solidity-coverage.
  // Ref: https://github.com/sc-forks/solidity-coverage/issues/707
  for (let i = 0; i < numBlocks; i++) {
    await hre.network.provider.send('evm_mine', [])
  }
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

  // bumps the internal timestamp of the node but does not mine blocks
  await hre.network.provider.send('evm_increaseTime', [toHexString(diff)])

  // evm_increaseTime does not actually mine anything
  await mineBlocks(1)
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

const ONE_DAY = 60 * 60 * 24
const ONE_HUNDRED_TWENTY_DAYS = ONE_DAY * 120

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

function funcSig(sig) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(sig)).slice(0, 10)
}

function getInterfaceID(selectors) {
  let interfaceID = ethers.BigNumber.from(0)
  for (let selector of selectors) {
    if (!(selector instanceof ethers.BigNumber)) {
      selector = ethers.BigNumber.from(selector)
    }
    interfaceID = interfaceID.xor(selector)
  }
  return interfaceID
}

module.exports = {
  BURN_ADDRESS,
  DUST,
  ONE_ETH,
  ONE_OGN,
  ONE_THOUSAND_OGN,
  ONE_DAY,
  ONE_HUNDRED_TWENTY_DAYS,
  ZERO_ADDRESS,
  allowToken,
  blockStamp,
  createUser,
  expectSuccess,
  funcSig,
  fundToken,
  getGas,
  getInterfaceID,
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
