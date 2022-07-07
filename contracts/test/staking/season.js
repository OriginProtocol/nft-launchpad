const crypto = require('crypto')
const { expect } = require('chai')

const { deployWithConfirmation } = require('../../utils/deploy')
const { stakingFixture } = require('../_fixture')
const {
  ONE_DAY,
  ONE_THOUSAND_OGN,
  blockStamp,
  expectSuccess,
  mineBlocks,
  mineUntilTime,
  loadFixture,
  randomAddress,
  rollback,
  snapshot
} = require('../helpers')

function randomName(name) {
  return `${name}_${crypto.randomBytes(4).toString('hex')}`
}

async function deployUnique(name, deployArgs) {
  deployArgs = deployArgs || []
  const contractName = randomName(name)
  await deployWithConfirmation(contractName, deployArgs, name)
  return await ethers.getContract(contractName)
}

// Tests for series that don't fit within general staking tests
describe('Season', () => {
  let fixture, fakeSeries, snapshotID

  before(async function () {
    await deployments.fixture()

    fixture = await loadFixture(stakingFixture)
    fakeSeries = fixture.master
  })

  beforeEach(async function () {
    snapshotID = await snapshot()
  })

  afterEach(async function () {
    await rollback(snapshotID)
  })

  it('can not deploy with invalid start time', async function () {
    const startTime = 100
    await expect(
      deployUnique('Season', [
        randomAddress(),
        startTime,
        startTime + 1,
        startTime + 2,
        startTime + 3
      ])
    ).to.be.revertedWith('Season: Invalid startTime')
  })

  it('can not deploy with invalid lock start time', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    await expect(
      deployUnique('Season', [
        randomAddress(),
        startTime,
        startTime - 1,
        startTime + 2,
        startTime + 3
      ])
    ).to.be.revertedWith('Season: Invalid lockStartTime')
  })

  it('can not deploy with invalid end time', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    await expect(
      deployUnique('Season', [
        randomAddress(),
        startTime,
        startTime + 1,
        startTime - 2,
        startTime + 3
      ])
    ).to.be.revertedWith('Season: Invalid endTime')
  })

  it('can not deploy with invalid end time', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    await expect(
      deployUnique('Season', [
        randomAddress(),
        startTime,
        startTime + 1,
        startTime + 2,
        startTime - 3
      ])
    ).to.be.revertedWith('Season: Invalid claimEndTime')
  })

  it('does not let randos stake', async function () {
    await expect(
      fixture.seasonOne
        .connect(fixture.nobody)
        .stake(randomAddress(), ONE_THOUSAND_OGN)
    ).to.be.revertedWith('Season: Not series contract')
  })

  it('does not let randos unstake', async function () {
    await expect(
      fixture.seasonOne.connect(fixture.nobody).unstake(randomAddress())
    ).to.be.revertedWith('Season: Not series contract')
  })

  it('does not let randos claim', async function () {
    await expect(
      fixture.seasonOne.connect(fixture.nobody).claim(randomAddress())
    ).to.be.revertedWith('Season: Not series contract')
  })

  it('can not stake with zero amount', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    const seriesAddress = await fakeSeries.getAddress()
    const season = await deployUnique('Season', [
      seriesAddress,
      startTime,
      startTime + 1,
      startTime + 2,
      startTime + 3
    ])

    await season.connect(fakeSeries).bootstrap(0)

    await expect(
      season.connect(fakeSeries).stake(randomAddress(), 0)
    ).to.be.revertedWith('Season: No incoming OGN')
  })

  it('can not stake before bootstrap', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    const seriesAddress = await fakeSeries.getAddress()
    const season = await deployUnique('Season', [
      seriesAddress,
      startTime,
      startTime + 1,
      startTime + 2,
      startTime + 3
    ])

    await expect(
      season.connect(fakeSeries).stake(randomAddress(), ONE_THOUSAND_OGN)
    ).to.be.revertedWith('Season: Season not bootstrapped.')
  })

  it('can unstake before bootstrap if not ended', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    const seriesAddress = await fakeSeries.getAddress()
    const season = await deployUnique('Season', [
      seriesAddress,
      startTime,
      startTime + 1,
      startTime + 2,
      startTime + 3
    ])

    await expectSuccess(season.connect(fakeSeries).unstake(randomAddress()))
  })

  it('can not unstake before bootstrap after ended', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    const seriesAddress = await fakeSeries.getAddress()
    const season = await deployUnique('Season', [
      seriesAddress,
      startTime,
      startTime + 1,
      startTime + 2,
      startTime + 3
    ])
    await mineUntilTime(startTime + 2)

    await expect(
      season.connect(fakeSeries).unstake(randomAddress())
    ).to.be.revertedWith('Season: Not bootstrapped.')
  })

  it('can claim before bootstrap if not ended', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    const seriesAddress = await fakeSeries.getAddress()
    const season = await deployUnique('Season', [
      seriesAddress,
      startTime,
      startTime + 1,
      startTime + 2,
      startTime + 3
    ])

    await expectSuccess(season.connect(fakeSeries).claim(randomAddress()))
  })

  it('can not claim before bootstrap after ended', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    const seriesAddress = await fakeSeries.getAddress()
    const season = await deployUnique('Season', [
      seriesAddress,
      startTime,
      startTime + 1,
      startTime + 2,
      startTime + 3
    ])
    await mineUntilTime(startTime + 2)

    await expect(
      season.connect(fakeSeries).claim(randomAddress())
    ).to.be.revertedWith('Season: Not bootstrapped.')
  })

  it('calculates points at start', async function () {
    const amount = ONE_THOUSAND_OGN
    const start = await fixture.seasonOne.startTime()
    const duration = ((await fixture.seasonOne.endTime()) - start) / ONE_DAY
    const expectedPoints = ethers.BigNumber.from(duration).mul(amount)

    expect(await fixture.seasonOne.pointsInTime(amount, start)).to.equal(
      expectedPoints
    )
  })

  it('calculates points for pre-stake', async function () {
    const amount = ONE_THOUSAND_OGN
    const start = await fixture.seasonOne.startTime()
    const duration = ((await fixture.seasonOne.endTime()) - start) / ONE_DAY
    const expectedPoints = ethers.BigNumber.from(duration).mul(amount)

    expect(
      await fixture.seasonOne.pointsInTime(amount, start - ONE_DAY * 14)
    ).to.equal(expectedPoints)
  })

  it('calculates points before lock', async function () {
    const amount = ONE_THOUSAND_OGN
    const stakeTime = (await fixture.seasonOne.lockStartTime()) - ONE_DAY * 3
    const duration = ((await fixture.seasonOne.endTime()) - stakeTime) / ONE_DAY
    const expectedPoints = ethers.BigNumber.from(duration).mul(amount)

    expect(await fixture.seasonOne.pointsInTime(amount, stakeTime)).to.equal(
      expectedPoints
    )
  })

  it('calculates points after lock', async function () {
    const amount = ONE_THOUSAND_OGN
    const stakeTime = (await fixture.seasonOne.lockStartTime()) + ONE_DAY * 3
    expect(await fixture.seasonOne.pointsInTime(amount, stakeTime)).to.equal(0)
  })

  it('calculates points after end', async function () {
    const amount = ONE_THOUSAND_OGN
    const stakeTime = (await fixture.seasonOne.endTime()) + ONE_DAY
    expect(await fixture.seasonOne.pointsInTime(amount, stakeTime)).to.equal(0)
  })

  it('reverts on double bootstrap', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    const seriesAddress = await fakeSeries.getAddress()
    const season = await deployUnique('Season', [
      seriesAddress,
      startTime,
      startTime + 1,
      startTime + 2,
      startTime + 3
    ])

    await season.connect(fakeSeries).bootstrap(0)

    await expect(season.connect(fakeSeries).bootstrap(123)).to.be.revertedWith(
      'Season: Already bootstrapped'
    )
  })

  it('reverts on ridiculous points', async function () {
    const startTime = (await blockStamp()) + 60 * 60
    // Number higher than max uint128, needed to allow a high points value to
    // pointsInTime()
    const lockStartTime = ethers.BigNumber.from(
      '680564733841876926926749214863536422910'
    )
    const seriesAddress = await fakeSeries.getAddress()
    const season = await deployUnique('Season', [
      seriesAddress,
      startTime,
      lockStartTime,
      lockStartTime + 2,
      lockStartTime + 3
    ])

    // Max uint128 + 1
    const crazyStamp = ethers.BigNumber.from(
      '340282366920938463463374607431768211456'
    )
    await expect(
      season.pointsInTime(ONE_THOUSAND_OGN, crazyStamp)
    ).to.be.revertedWith('Season: Points overflow')
  })

  it('returns rollover points before bootstrap', async function () {
    const startTime = (await fixture.seasonOne.endTime()) + 60 * 60
    const lockStartTime = startTime + ONE_DAY
    const endTime = startTime + ONE_DAY * 2
    const claimEndTime = startTime + ONE_DAY * 3

    // Stake in S1
    await fixture.userStake(fixture.users.alice)
    // Deploy another season that will get no stakes
    const season = await deployUnique('Season', [
      fixture.series.address,
      startTime,
      lockStartTime,
      endTime,
      claimEndTime
    ])
    await expectSuccess(fixture.series.pushSeason(season.address))

    await mineUntilTime(startTime)
    await mineBlocks(1)

    const meta = await season.season()
    expect(meta.bootstrapped).to.be.false

    const expected = await season.pointsInTime(ONE_THOUSAND_OGN, startTime)
    expect(await season.getTotalPoints()).to.equal(expected)
  })

  it('does not revert when expectedRewards() called with no totalPoints', async function () {
    const startTime = (await fixture.seasonOne.endTime()) + 60 * 60
    const lockStartTime = startTime + ONE_DAY
    const endTime = startTime + ONE_DAY * 2
    const claimEndTime = startTime + ONE_DAY * 3

    // Stake in S1
    await fixture.userStake(fixture.users.alice)
    // Deploy another season that will get no stakes
    const season = await deployUnique('Season', [
      fixture.series.address,
      startTime,
      lockStartTime,
      endTime,
      claimEndTime
    ])
    await expectSuccess(fixture.series.pushSeason(season.address))

    await mineUntilTime(endTime)
    await mineBlocks(1)

    const [ethShare, ognRewards] = await season.expectedRewards(
      fixture.users.alice.address
    )

    expect(ethShare).to.equal(0)
    expect(ognRewards).to.equal(0)
  })
})
