const { expect } = require('chai')

const { deployWithConfirmation } = require('../../utils/deploy')

const { stakingFixture } = require('../_fixture')
const {
  ONE_ETH,
  ONE_THOUSAND_OGN,
  expectSuccess,
  loadFixture,
  mineUntilTime,
  snapshot,
  rollback
} = require('../helpers')

const oneHundredTwentyDays = 60 * 60 * 24 * 120

async function createUser(signer) {
  return {
    txFees: ethers.BigNumber.from(0),
    signer,
    address: await signer.getAddress(),
    originalBalanceETH: await signer.getBalance(),
    originalBalanceOGN: ethers.BigNumber.from(0)
  }
}

// Check that things mechanically work
describe('Staking Bug - Rollover points on previous season', () => {
  const users = {
    alice: null,
    bob: null,
    charlie: null,
    diana: null,
    elaine: null
  }
  let deployer,
    endTime,
    feeVault,
    feeVaultProxy,
    lockPeriod,
    master,
    mockOGN,
    seasonOne,
    seasonTwo,
    series,
    snapshotId

  async function allowOGN(account, spenderAddress, amount) {
    const tx = await mockOGN.connect(account).approve(spenderAddress, amount)
    return tx.wait(1)
  }

  async function fundOGN(toAddress, amount) {
    return await mockOGN.connect(deployer).mint(toAddress, amount)
  }

  async function userStake(user, amount = ONE_THOUSAND_OGN) {
    await fundOGN(user.address, amount)
    user.originalBalanceOGN = await mockOGN.balanceOf(user.address)
    const allowReceipt = await allowOGN(user.signer, series.address, amount)
    const allowFees = allowReceipt.gasUsed.mul(allowReceipt.effectiveGasPrice)
    const stakeReceipt = await expectSuccess(
      series.connect(user.signer).stake(amount)
    )
    const stakeFees = stakeReceipt.gasUsed.mul(stakeReceipt.effectiveGasPrice)
    user.timestamp = (await ethers.provider.getBlock()).timestamp
    user.points = await seasonOne.getPoints(user.address)

    return {
      txFees: stakeFees.add(allowFees)
    }
  }

  before(async function () {
    snapshotId = await snapshot()
    await deployments.fixture()

    users.alice = await createUser(await ethers.provider.getSigner(6))
    users.bob = await createUser(await ethers.provider.getSigner(7))
    users.charlie = await createUser(await ethers.provider.getSigner(8))
    users.diana = await createUser(await ethers.provider.getSigner(9))
    users.elaine = await createUser(await ethers.provider.getSigner(10))

    const { series: _series, mockOGN: _mockOgn } = await loadFixture(
      stakingFixture
    )
    const { deployerAddr, masterAddr } = await getNamedAccounts()

    deployer = ethers.provider.getSigner(deployerAddr)
    master = ethers.provider.getSigner(masterAddr)
    mockOGN = _mockOgn
    series = _series
    feeVaultProxy = await ethers.getContract('FeeVaultProxy')
    feeVault = await ethers.getContractAt('FeeVault', feeVaultProxy.address)

    seasonOne = await ethers.getContract('SeasonOne')
    endTime = await seasonOne.endTime()
    lockPeriod = await seasonOne.lockPeriod()

    const claimPeriod = await seasonOne.claimPeriod()

    await deployWithConfirmation('SeasonTwo', [
      series.address,
      endTime,
      endTime + oneHundredTwentyDays,
      claimPeriod,
      lockPeriod
    ])

    seasonTwo = await ethers.getContract('SeasonTwo')

    await series.connect(deployer).pushSeason(seasonTwo.address)
  })

  after(async function () {
    await rollback(snapshotId)
  })

  it('vault receives funds', async function () {
    await expectSuccess(
      master.sendTransaction({
        to: feeVault.address,
        value: ONE_ETH
      })
    )
  })

  it('lets alice stake', async function () {
    await userStake(users.alice)
  })

  it('lets bob stake', async function () {
    // Mine until SeasonTwo start
    await mineUntilTime(endTime)
    // Bob stakes in SeasonTwo
    const { txFees } = await userStake(users.bob, ONE_THOUSAND_OGN.div(2))
    users.bob.txFees = users.bob.txFees.add(txFees)
  })

  it('does not reward bob in SeasonOne', async function () {
    const receipt = await expectSuccess(
      series.connect(users.bob.signer).claimRewards(users.bob.address)
    )
    users.bob.txFees = users.bob.txFees.add(
      receipt.gasUsed.mul(receipt.effectiveGasPrice)
    )

    const afterETH = await ethers.provider.getBalance(users.bob.address)
    expect(users.bob.originalBalanceETH.sub(users.bob.txFees)).to.equal(
      afterETH
    )
  })
})
