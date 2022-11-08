const { expect } = require('chai')

const { deployWithConfirmation } = require('../../utils/deploy')
const { stakingFixture } = require('../_fixture')
const {
  ONE_ETH,
  ONE_OGN,
  ONE_THOUSAND_OGN,
  blockStamp,
  expectSuccess,
  loadFixture,
  mineBlocks,
  mineUntilTime,
  snapshot,
  rollback
} = require('../helpers')

describe('Points Rollover During Lock Period', () => {
  let seasonThree,
    fixture,
    snapshotID,
    fundOGN,
    users = {
      alice: null,
      bob: null,
      charlie: null,
      diana: null,
      elaine: null
    },
    userStake,
    bobsOriginalPoints

  before(async function () {
    snapshotID = await snapshot()
    await deployments.fixture()

    fixture = await loadFixture(stakingFixture)
    fundOGN = fixture.fundOGN
    users = fixture.users
    userStake = fixture.userStake

    const startTime = await fixture.seasonOne.startTime()

    await mineUntilTime(startTime.add(60 * 60))
    const now = await blockStamp()
    expect(startTime).to.be.below(now)

    const s3StartTime = await fixture.seasonTwo.endTime()
    const s3LockStartTime = s3StartTime + 200
    const s3EndTime = (await fixture.seasonTwo.claimEndTime()) + 300
    const s3ClaimEndTime = s3EndTime + 400
    await deployWithConfirmation(
      'SeasonThreeBPR',
      [
        fixture.series.address,
        s3StartTime,
        s3LockStartTime,
        s3EndTime,
        s3ClaimEndTime
      ],
      'SeasonV2'
    )
    seasonThree = await ethers.getContract('SeasonThreeBPR')
    await fixture.series.pushSeason(fixture.seasonTwo.address)
    await fixture.series.pushSeason(seasonThree.address)

    // Send some rewards to the vault
    await expectSuccess(
      fixture.master.sendTransaction({
        to: fixture.feeVault.address,
        value: ONE_ETH
      })
    )
    await fundOGN(fixture.feeVault.address, ONE_OGN)
  })

  after(async function () {
    await rollback(snapshotID)
  })

  it('should let Alice and Bob stake in SeasonOne', async function () {
    await userStake(users.alice)
    await userStake(users.bob)

    expect(await fixture.series.totalSupply()).to.equal(ONE_THOUSAND_OGN.mul(2))
    bobsOriginalPoints = await fixture.seasonOne.getPoints(users.bob.address)
  })

  it('should begin lock period of SeasonOne', async function () {
    // Make sure we're bootstrapped
    await mineUntilTime(await fixture.seasonOne.lockStartTime())
    await userStake(users.charlie)
    expect(await fixture.seasonTwo.getTotalPoints()).to.be.above(0)
    expect(await blockStamp()).to.be.above(
      await fixture.seasonOne.lockStartTime()
    )
    expect(await blockStamp()).to.be.below(await fixture.seasonTwo.startTime())
  })

  it('should let Diana stake in SeasonTwo', async function () {
    expect(await fixture.series.balanceOf(users.diana.address)).to.equal(0)
    // Alice staking to SeasonThree because SeasonTwo is locked
    await userStake(users.diana)
    expect(await fixture.series.balanceOf(users.diana.address)).to.equal(
      ONE_THOUSAND_OGN
    )
    const user = await fixture.seasonOne.users(users.diana.address)
    // User won't exist because it won't "stake back" if there's no existing
    // stake
    expect(user.exists).to.be.false
  })

  it('should let Bob add to his stake in SeasonTwo when SeasonOne is locked', async function () {
    expect(await fixture.series.balanceOf(users.bob.address)).to.equal(
      ONE_THOUSAND_OGN
    )
    // Bob staking to SeasonTwo because SeasonOne is locked
    await userStake(users.bob)
    expect(await fixture.series.balanceOf(users.bob.address)).to.equal(
      ONE_THOUSAND_OGN.mul(2)
    )
  })

  it('should begin lock period of SeasonTwo', async function () {
    // Lock season
    const s2LockStartTime = await fixture.seasonTwo.lockStartTime()
    await mineUntilTime(s2LockStartTime)
    await mineBlocks(1)
    expect(await blockStamp()).to.be.above(s2LockStartTime)
  })

  it('should let Alice add to her stake in SeasonThree when SeasonTwo is locked', async function () {
    expect(await fixture.series.balanceOf(users.alice.address)).to.equal(
      ONE_THOUSAND_OGN
    )
    // Alice staking to SeasonThree because SeasonTwo is locked
    await userStake(users.alice)
    expect(await fixture.series.balanceOf(users.alice.address)).to.equal(
      ONE_THOUSAND_OGN.mul(2)
    )
  })

  it('(noop) should end SeasonTwo', async function () {
    await mineUntilTime(await fixture.seasonTwo.endTime())
    await mineBlocks(1)
  })

  it('should show Alice with points in SeasonTwo', async function () {
    const user = await fixture.seasonTwo.users(users.alice.address)
    expect(user.exists).to.be.true
  })

  it('should expect Alice to have rewards', async function () {
    const vaultBalanceETH = await ethers.provider.getBalance(
      fixture.feeVault.address
    )
    const vaultBalanceOGN = await fixture.mockOGN.balanceOf(
      fixture.feeVault.address
    )
    expect(vaultBalanceETH).to.equal(ONE_ETH)
    expect(vaultBalanceOGN).to.equal(ONE_OGN)

    const stamp = await blockStamp()
    expect(stamp).to.be.above(await fixture.seasonTwo.endTime())
    expect(stamp).to.be.below(await fixture.seasonTwo.claimEndTime())

    const [expectedETH, expectedOGN] = await fixture.seasonTwo.expectedRewards(
      users.alice.address
    )

    // TODO: Make this more dynamic?
    expect(expectedETH).to.equal('200000000000000000')
    expect(expectedOGN).to.equal('200000000000000000')
  })

  it('should let Alice claim SeasonTwo rewards once claim period starts', async function () {
    const originalBalance = await users.alice.signer.getBalance()
    const receipt = await expectSuccess(
      fixture.series.connect(users.alice.signer).claim()
    )
    const fees = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const endBalance = await users.alice.signer.getBalance()
    expect(endBalance).to.be.above(originalBalance.sub(fees))
  })
})
