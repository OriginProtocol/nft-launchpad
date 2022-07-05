const { expect } = require('chai')

const { stakingFixture } = require('../_fixture')
const {
  DUST,
  ONE_DAY,
  ONE_HUNDRED_TWENTY_DAYS,
  ONE_ETH,
  ONE_THOUSAND_OGN,
  BURN_ADDRESS,
  blockStamp,
  expectSuccess,
  loadFixture,
  mineBlocks,
  mineUntilTime,
  roughlyEqual,
  snapshot,
  rollback
} = require('../helpers')
const { ASSET_ETH_TOPIC, REWARDS_SENT_TOPIC } = require('./_const')

const abiCoder = ethers.utils.defaultAbiCoder

// Check that things mechanically work
describe('Staking Scenarios', () => {
  describe('5 equal stakers over time', () => {
    const totalRewards = ONE_ETH.mul(123)
    const rewardsOGN = ONE_THOUSAND_OGN.mul('100')
    let fixture,
      endTime,
      lockStartTime,
      snapshotID,
      fundOGN,
      allowOGN,
      users = {
        alice: null,
        bob: null,
        charlie: null,
        diana: null,
        elaine: null
      },
      userStake

    before(async function () {
      snapshotID = await snapshot()
      await deployments.fixture()

      fixture = await loadFixture(stakingFixture)
      allowOGN = fixture.allowOGN
      fundOGN = fixture.fundOGN
      users = fixture.users
      userStake = fixture.userStake

      const startTime = await fixture.seasonOne.startTime()
      lockStartTime = await fixture.seasonOne.lockStartTime()
      endTime = await fixture.seasonOne.endTime()

      await mineUntilTime(startTime.add(60 * 60))
      const now = await blockStamp()
      expect(startTime).to.be.below(now)
    })

    after(async function () {
      await rollback(snapshotID)
    })

    it('should show no expected rewards', async function () {
      for (const name in users) {
        const [expectedETH, expectedOGN] =
          await fixture.seasonOne.expectedRewards(users[name].address)
        expect(expectedETH).to.equal(0)
        expect(expectedOGN).to.equal(0)
      }
    })

    it('lets alice stake', async function () {
      await userStake(users.alice)
      const stamp = await blockStamp()
      await mineUntilTime(stamp + ONE_DAY)
    })

    it('lets bob stake', async function () {
      const stamp = await blockStamp()
      await userStake(users.bob)
      await mineUntilTime(stamp + ONE_DAY * 3)
    })

    it('lets charlie stake', async function () {
      await userStake(users.charlie)
      const stamp = await blockStamp()
      await mineUntilTime(stamp + ONE_DAY * 5)
    })

    it('lets diana stake', async function () {
      await userStake(users.diana)
      const stamp = await blockStamp()
      await mineUntilTime(stamp + ONE_DAY * 14)
    })

    it('lets elaine stake', async function () {
      await userStake(users.elaine)
      const stamp = await blockStamp()
      await mineUntilTime(stamp + ONE_DAY * 30)
    })

    it('has sane staked amounts', async function () {
      const addresses = Object.keys(users).map((k) => users[k].address)
      let totalStaked = ethers.BigNumber.from(0)
      for (const address of addresses) {
        const staked = await fixture.series.balanceOf(address)
        expect(staked).to.equal(ONE_THOUSAND_OGN)
        totalStaked = totalStaked.add(staked)
      }
      expect(await fixture.series.totalSupply()).to.equal(totalStaked)
    })

    it('has sane user points', async function () {
      let last = 0
      let totalPoints = ethers.BigNumber.from(0)
      for (const user in users) {
        const points = users[user].points
        if (last > 0) {
          expect(points).to.be.below(last)
        }
        last = points
        totalPoints = totalPoints.add(points)
      }
      expect(await fixture.seasonOne.getTotalPoints()).to.equal(totalPoints)
    })

    it('has sane stake balances', async function () {
      const addresses = Object.keys(users).map((k) => users[k].address)
      for (const address of addresses) {
        expect(await fixture.series.balanceOf(address)).to.equal(
          ONE_THOUSAND_OGN
        )
      }
    })

    it(`should allow new stakes after lock period without points`, async function () {
      const contractLockStart = (
        await fixture.seasonOne.lockStartTime()
      ).toNumber()
      expect(contractLockStart).to.equal(lockStartTime)

      // Push us into the lock period
      await mineUntilTime(lockStartTime)

      await fundOGN(users.alice.address, ONE_THOUSAND_OGN)
      await allowOGN(
        users.alice.signer,
        fixture.series.address,
        ONE_THOUSAND_OGN
      )

      const aliceOrig = await fixture.seasonOne.getPoints(users.alice.address)
      await userStake(users.alice)
      const aliceAfter = await fixture.seasonOne.getPoints(users.alice.address)

      expect(aliceOrig).to.equal(aliceAfter)

      // Burn the OGN just so following balance checks function
      await fixture.mockOGN
        .connect(users.alice.signer)
        .transfer(BURN_ADDRESS, ONE_THOUSAND_OGN)
    })

    it('receives funds and end season (noop)', async function () {
      await expectSuccess(
        fixture.master.sendTransaction({
          to: fixture.feeVault.address,
          value: totalRewards
        })
      )

      // Send some OGN rewards to the season as well
      await fundOGN(fixture.feeVault.address, rewardsOGN)
      expect(
        await fixture.mockOGN.balanceOf(fixture.feeVault.address)
      ).to.equal(rewardsOGN)

      // Wrap up the season
      await mineUntilTime(endTime)
      // Sometimes stamp is equal +1s, so this reduces test flakiness
      await mineBlocks(1)

      expect((await ethers.provider.getBlock()).timestamp).to.be.above(endTime)
    })

    for (const name in users) {
      it(`allows ${name} to unstake (first ends the season)`, async function () {
        const user = users[name]
        const receipt = await expectSuccess(
          fixture.series.connect(user.signer).unstake()
        )

        // Get the RewardsPaid event and store amount paid
        const paidETHEv = receipt.logs.filter(
          (ev) =>
            ev.topics[0] === REWARDS_SENT_TOPIC &&
            ev.topics[1] === ASSET_ETH_TOPIC
        )[0]
        const paidOGNEv = receipt.logs.filter(
          (ev) =>
            ev.topics[0] === REWARDS_SENT_TOPIC &&
            ev.topics[1] ===
              `0x${fixture.mockOGN.address
                .slice(2)
                .padStart(64, '0')
                .toLowerCase()}`
        )[0]
        const paidETH = abiCoder.decode(['uint256'], paidETHEv.data)[0]
        const paidOGN = abiCoder.decode(['uint256'], paidOGNEv.data)[0]
        users[name].paid = paidETH

        expect(paidETH).to.be.above(0)
        expect(paidOGN).to.be.above(0)
        expect(await fixture.series.balanceOf(user.address)).to.equal(0)

        // Verify rewards were paid
        const balanceETH = await ethers.provider.getBalance(user.address)
        const expectedETH = user.originalBalanceETH.add(paidETH)
        const balanceOGN = await fixture.mockOGN.balanceOf(user.address)
        const expectedOGN = user.originalBalanceOGN.add(paidOGN)

        // rough equality because of gas fees
        expect(roughlyEqual(balanceETH, expectedETH)).to.be.true
        expect(balanceOGN).to.equal(expectedOGN)

        await mineBlocks(1)
      })
    }

    for (const name in users) {
      it(`${name} should receive share of fee according to points`, async function () {
        const user = users[name]
        const balance = await user.signer.getBalance()
        expect(balance).to.be.above(user.originalBalanceETH)
      })
    }

    it(`should have paid out all rewards`, async function () {
      const totalPaid = Object.keys(users).reduce((total, name) => {
        const user = users[name]
        return total.add(user.paid)
      }, ethers.BigNumber.from(0))
      const vaultBalance = await ethers.provider.getBalance(
        fixture.feeVault.address
      )
      const seasonOneBalance = await ethers.provider.getBalance(
        fixture.seasonOne.address
      )
      const snapshot = await fixture.seasonOne.snapshot()

      expect(seasonOneBalance).to.equal(0)
      // Usually a tiny bit of dust leftover from share math
      expect(vaultBalance).to.be.below(DUST)
      expect(totalPaid).to.equal(totalRewards.sub(vaultBalance))
      expect(snapshot.rewardETH).to.equal(totalRewards)
      expect(snapshot.rewardOGN).to.equal(rewardsOGN)

      const meta = await fixture.seasonOne.season()
      expect(meta.bootstrapped).to.be.true
      expect(meta.snapshotTaken).to.be.true
      expect(meta.totalPoints).to.equal(
        await fixture.seasonOne.getTotalPoints()
      )
    })

    it('(noop) shows user data', async function () {
      console.log(
        `User,Points,Days,Original ETH,Profit ETH,Original OGN,Rewards OGN`
      )
      let toatlETHPaid = ethers.BigNumber.from('0')
      let toatlOGNPaid = ethers.BigNumber.from('0')
      for (const user in users) {
        const originalETH = ethers.utils.formatUnits(
          users[user].originalBalanceETH
        )
        const paidETH = (await users[user].signer.getBalance()).sub(
          users[user].originalBalanceETH
        )
        toatlETHPaid = toatlETHPaid.add(paidETH)
        const originalOGN = ethers.utils.formatUnits(
          users[user].originalBalanceOGN
        )
        const paidOGN = (
          await fixture.mockOGN.balanceOf(users[user].address)
        ).sub(users[user].originalBalanceOGN)
        toatlOGNPaid = toatlOGNPaid.add(paidOGN)
        const days = Math.floor((endTime - users[user].timestamp) / ONE_DAY)
        console.log(
          `${user},${ethers.utils.formatUnits(
            users[user].points
          )},${days},${originalETH},${ethers.utils.formatUnits(
            paidETH
          )} ETH,${originalOGN},${ethers.utils.formatUnits(paidOGN)} OGN`
        )
      }
    })
  })

  describe('2 stakers, one rolls over', () => {
    let fixture,
      deployer,
      endTime,
      snapshotID,
      users = {
        alice: null,
        bob: null,
        charlie: null,
        diana: null,
        elaine: null
      },
      userStake

    before(async function () {
      snapshotID = await snapshot()
      await deployments.fixture()

      fixture = await loadFixture(stakingFixture)
      users = fixture.users
      userStake = fixture.userStake
      deployer = fixture.deployer

      endTime = await fixture.seasonOne.endTime()
    })

    after(async function () {
      await rollback(snapshotID)
    })

    it('lets alice stakes', async function () {
      await userStake(users.alice)
      await mineBlocks(100)
    })

    it('lets bob stake', async function () {
      await userStake(users.bob)
      await mineBlocks(100)
    })

    it('lets bob unstake from SeasonOne', async function () {
      await expectSuccess(fixture.series.connect(users.bob.signer).unstake())

      // Setup SeasonTwo
      await expectSuccess(
        fixture.series.connect(deployer).pushSeason(fixture.seasonTwo.address)
      )

      // SeasonOne is over
      await mineUntilTime(endTime)

      // Should only be 1k left from Alice
      expect(await fixture.series.totalSupply()).to.equal(ONE_THOUSAND_OGN)
    })

    it('lets charlie stake on SeasonTwo', async function () {
      await userStake(users.charlie)
      await mineBlocks(100)
    })

    it('lets diana stake on SeasonTwo', async function () {
      await userStake(users.diana)
      await mineBlocks(100)
    })

    it('is has sane values of rolled over stakes', async function () {
      expect(await fixture.series.totalSupply()).to.equal(
        ONE_THOUSAND_OGN.mul(3)
      )
      expect(await fixture.seasonTwo.getTotalPoints()).to.be.above(
        users.charlie.points
      )
    })
  })

  describe('2 stakers, one unstakes from previous season after rollover', () => {
    let fixture,
      deployer,
      endTime,
      snapshotID,
      users = {
        alice: null,
        bob: null,
        charlie: null,
        diana: null,
        elaine: null
      },
      userStake

    before(async function () {
      snapshotID = await snapshot()
      await deployments.fixture()

      fixture = await loadFixture(stakingFixture)
      users = fixture.users
      userStake = fixture.userStake
      deployer = fixture.deployer

      endTime = await fixture.seasonOne.endTime()
      fixture.seasonTwo = await ethers.getContract('SeasonTwo')
    })

    after(async function () {
      await rollback(snapshotID)
    })

    it('lets alice stakes', async function () {
      await userStake(users.alice)
      await mineBlocks(100)
    })

    it('lets bob stake', async function () {
      await userStake(users.bob)
      await mineBlocks(100)
    })

    it('ends SeasonOne and starts SeasonTwo', async function () {
      // Add SeasonTwo to the Series
      await expectSuccess(
        fixture.series.connect(deployer).pushSeason(fixture.seasonTwo.address)
      )

      // Should be no previous season yet
      expect(await fixture.series.currentStakingIndex()).to.equal(0)

      // SeasonOne is over
      await mineUntilTime(endTime)
    })

    it('lets charlie stake on SeasonTwo', async function () {
      await userStake(users.charlie)

      // Previous season should now be SeasonOne
      const currentStakingIndex = await fixture.series.currentStakingIndex()
      expect(await fixture.series.seasons(currentStakingIndex - 1)).to.equal(
        fixture.seasonOne.address
      )
    })

    it('lets bob unstake from SeasonOne', async function () {
      expect(await fixture.series.totalSupply()).to.equal(
        ONE_THOUSAND_OGN.mul(3)
      )

      await expectSuccess(fixture.series.connect(users.bob.signer).unstake())

      // Should only be 1k left from Alice
      expect(await fixture.series.totalSupply()).to.equal(
        ONE_THOUSAND_OGN.mul(2)
      )
    })

    it('is has sane values of rolled over stakes', async function () {
      expect(await fixture.series.totalSupply()).to.equal(
        ONE_THOUSAND_OGN.mul(2)
      )
      expect(await fixture.seasonTwo.getTotalPoints()).to.be.above(
        users.charlie.points
      )
    })
  })

  describe('2 stakers, one does not unstake', () => {
    let fixture,
      deployer,
      endTime,
      snapshotID,
      fundOGN,
      users = {
        alice: null,
        bob: null,
        charlie: null,
        diana: null,
        elaine: null
      },
      userStake

    before(async function () {
      snapshotID = await snapshot()
      await deployments.fixture()

      fixture = await loadFixture(stakingFixture)
      fundOGN = fixture.fundOGN
      users = fixture.users
      userStake = fixture.userStake
      deployer = fixture.deployer

      endTime = await fixture.seasonOne.endTime()
      fixture.seasonTwo = await ethers.getContract('SeasonTwo')
    })

    after(async function () {
      await rollback(snapshotID)
    })

    it('lets alice stakes', async function () {
      await userStake(users.alice)
      await mineBlocks(100)
    })

    it('lets bob stake', async function () {
      await userStake(users.bob)
      await mineBlocks(100)
    })

    it('should not unstake from season if Alice claims early', async function () {
      const user = users.alice
      const originalPoints = await fixture.seasonOne.getPoints(user.address)
      const receipt = await expectSuccess(
        fixture.series.connect(user.signer).claim()
      )
      expect(receipt.logs).to.have.lengthOf(0)
      expect(await fixture.seasonOne.getPoints(user.address)).to.equal(
        originalPoints
      )
    })

    it('(noop) end season', async function () {
      await expectSuccess(
        fixture.master.sendTransaction({
          to: fixture.feeVault.address,
          value: ONE_ETH
        })
      )

      // Send some OGN rewards to the season as well
      const rewardsOGN = ONE_THOUSAND_OGN.mul('100')
      await fundOGN(fixture.feeVault.address, rewardsOGN)
      expect(
        await fixture.mockOGN.balanceOf(fixture.feeVault.address)
      ).to.equal(rewardsOGN)

      // Setup SeasonTwo
      await expectSuccess(
        fixture.series.connect(deployer).pushSeason(fixture.seasonTwo.address)
      )

      // SeasonOne is over
      await mineUntilTime(endTime)
      await mineBlocks(1)
    })

    it('lets alice collect rewards', async function () {
      const user = users.alice

      const endTime = await fixture.seasonOne.endTime()
      const claimEndTime = await fixture.seasonOne.claimEndTime()
      const now = await blockStamp()
      expect(now).to.be.above(endTime)
      expect(now).to.be.below(claimEndTime)

      const [expectedETHCalculated, expectedOGNCalculated] =
        await fixture.seasonOne.expectedRewards(user.address)
      const receipt = await expectSuccess(
        fixture.series.connect(user.signer).claim()
      )

      const paidETHEv = receipt.logs.filter(
        (ev) =>
          ev.topics[0] === REWARDS_SENT_TOPIC &&
          ev.topics[1] === ASSET_ETH_TOPIC
      )[0]
      const paidOGNEv = receipt.logs.filter(
        (ev) =>
          ev.topics[0] === REWARDS_SENT_TOPIC &&
          ev.topics[1] ===
            `0x${fixture.mockOGN.address
              .slice(2)
              .padStart(64, '0')
              .toLowerCase()}`
      )[0]
      const paidETH = abiCoder.decode(['uint256'], paidETHEv.data)[0]
      const paidOGN = abiCoder.decode(['uint256'], paidOGNEv.data)[0]
      users.alice.paid = paidETH

      expect(paidETH).to.be.above(0)
      expect(paidOGN).to.be.above(0)
      expect(await fixture.series.balanceOf(user.address)).to.equal(
        ONE_THOUSAND_OGN
      )

      // Verify rewards were paid
      const balanceETH = await ethers.provider.getBalance(user.address)
      const expectedETH = user.originalBalanceETH.add(paidETH)
      const balanceOGN = await fixture.mockOGN.balanceOf(user.address)
      const expectedOGN = paidOGN // user.originalBalanceOGN.add(paidOGN)

      // rough equality because of gas fees
      expect(roughlyEqual(balanceETH, expectedETH)).to.be.true
      expect(roughlyEqual(balanceOGN, expectedOGN)).to.be.true
      expect(paidETH).to.equal(expectedETHCalculated)
      expect(paidOGN).to.equal(expectedOGNCalculated)
    })
  })

  describe('should pre-stake in SeasonTwo when SeasonOne in lock period', () => {
    let fixture,
      deployer,
      endTime,
      lockStartTime,
      snapshotID,
      fundOGN,
      allowOGN,
      users = {
        alice: null,
        bob: null,
        charlie: null,
        diana: null,
        elaine: null
      },
      userStake

    before(async function () {
      snapshotID = await snapshot()
      await deployments.fixture()

      fixture = await loadFixture(stakingFixture)
      users = fixture.users
      userStake = fixture.userStake
      deployer = fixture.deployer

      endTime = await fixture.seasonOne.endTime()
      lockStartTime = await fixture.seasonOne.lockStartTime()
      fixture.seasonTwo = await ethers.getContract('SeasonTwo')

      const initialSupply = await fixture.series.totalSupply()
      expect(initialSupply).to.equal(0)
      expect(await fixture.seasonOne.getTotalPoints()).to.equal(0)
      expect(await fixture.seasonTwo.getTotalPoints()).to.equal(0)
    })

    after(async function () {
      await rollback(snapshotID)
    })

    it('lets alice stakes', async function () {
      await userStake(users.alice)
      expect(await fixture.seasonOne.getTotalPoints()).to.equal(
        users.alice.points
      )
      await mineBlocks(100)
      expect(await fixture.series.totalSupply()).to.equal(ONE_THOUSAND_OGN)
    })

    it('lets bob stake', async function () {
      await userStake(users.bob)
      expect(await fixture.seasonOne.getTotalPoints()).to.equal(
        users.alice.points.add(users.bob.points)
      )
      await mineBlocks(100)
      expect(await fixture.series.totalSupply()).to.equal(
        ONE_THOUSAND_OGN.mul(2)
      )
    })

    it('(noop) enter season lock period', async function () {
      await expectSuccess(
        fixture.master.sendTransaction({
          to: fixture.feeVault.address,
          value: ONE_ETH
        })
      )

      // Setup SeasonTwo
      await expectSuccess(
        fixture.series.connect(deployer).pushSeason(fixture.seasonTwo.address)
      )

      // SeasonOne is now locked
      await mineUntilTime(lockStartTime)
    })

    it('charlie pre-stake in season two', async function () {
      const supplyBeforeStake = await fixture.series.totalSupply()
      const seasonOnePoints = await fixture.seasonOne.getTotalPoints()

      await userStake(users.charlie)
      await mineBlocks(100)

      expect(await fixture.seasonOne.getPoints(users.charlie.address)).to.equal(
        0
      )
      const charliePoints = await fixture.seasonTwo.getPoints(
        users.charlie.address
      )
      expect(charliePoints).to.be.above(0)

      // SeasonOne points should not have increased
      expect(await fixture.seasonOne.getTotalPoints()).to.equal(seasonOnePoints)

      const seasonTwoTotal = await fixture.seasonTwo.getTotalPoints()
      // SeasonOne points should have increased and be equal to Charlie's
      expect(seasonTwoTotal).to.be.above(charliePoints)
      expect(seasonTwoTotal).to.be.above(seasonOnePoints)

      const stakeDays = ethers.BigNumber.from(ONE_HUNDRED_TWENTY_DAYS).div(
        ONE_DAY
      )
      const expectedRolloverPoints = supplyBeforeStake.mul(stakeDays)

      expect(seasonTwoTotal).to.equal(charliePoints.add(expectedRolloverPoints))
    })

    it('diana pre-stake in season two', async function () {
      await userStake(users.diana)
      await mineBlocks(100)

      const charliePoints = await fixture.seasonTwo.getPoints(
        users.charlie.address
      )
      // Points should be the same for all pre-stakes
      expect(charliePoints).to.equal(users.charlie.points)
    })

    it('bob unstake after season one lock', async function () {
      const seasonOnePoints = await fixture.seasonOne.getTotalPoints()
      const seasonTwoPoints = await fixture.seasonTwo.getTotalPoints()

      await expectSuccess(fixture.series.connect(users.bob.signer).unstake())

      const seasonOnePointsAfter = await fixture.seasonOne.getTotalPoints()
      const seasonTwoPointsAfter = await fixture.seasonTwo.getTotalPoints()
      // Points should have reduced in season one
      expect(seasonOnePointsAfter).to.equal(
        seasonOnePoints.sub(users.bob.points)
      )
      // Season two should have changed as well since Bob's points would have
      // rolled over during bootstrap() in push() even though he never
      // interacted with it
      expect(seasonTwoPointsAfter).to.equal(
        seasonTwoPoints.sub(users.bob.points)
      )
    })

    it('charlie unstake after season one ends', async function () {
      const seasonOnePoints = await fixture.seasonOne.getTotalPoints()
      const seasonTwoPoints = await fixture.seasonTwo.getTotalPoints()

      // Season one ends
      await mineUntilTime(endTime)

      await expectSuccess(
        fixture.series.connect(users.charlie.signer).unstake()
      )

      // Bob should've had more points in season two
      const seasonOnePointsAfter = await fixture.seasonOne.getTotalPoints()
      const seasonTwoPointsAfter = await fixture.seasonTwo.getTotalPoints()
      // No change expected in season one
      expect(seasonOnePointsAfter).to.equal(seasonOnePoints)
      expect(seasonTwoPointsAfter).to.equal(
        seasonTwoPoints.sub(users.charlie.points)
      )
    })
  })

  describe('Can stake after lock without a next season', () => {
    let fixture,
      claimEndTime,
      endTime,
      lockStartTime,
      snapshotID,
      users = {
        alice: null,
        bob: null,
        charlie: null,
        diana: null,
        elaine: null
      },
      userStake

    before(async function () {
      snapshotID = await snapshot()
      await deployments.fixture()

      fixture = await loadFixture(stakingFixture)
      users = fixture.users
      userStake = fixture.userStake

      lockStartTime = await fixture.seasonOne.lockStartTime()
      endTime = await fixture.seasonOne.endTime()
      claimEndTime = await fixture.seasonOne.claimEndTime()
    })

    after(async function () {
      await rollback(snapshotID)
    })

    it('lets alice stakes', async function () {
      await userStake(users.alice)
      await mineBlocks(100)
    })

    it('lets bob stake', async function () {
      await userStake(users.bob)
      await mineBlocks(100)
    })

    it('Season one should entered lock period', async function () {
      // SeasonOne is now locked
      await mineUntilTime(lockStartTime)
      expect(
        await fixture.series.seasons(await fixture.series.currentStakingIndex())
      ).to.equal(fixture.seasonOne.address)
    })

    it('lets charlie stake on SeasonOne but receives no points', async function () {
      await userStake(users.charlie)
      expect(await fixture.seasonOne.getPoints(users.charlie.address)).to.equal(
        0
      )
      expect(await fixture.series.balanceOf(users.charlie.address)).to.equal(
        ONE_THOUSAND_OGN
      )
      expect(
        await fixture.series.seasons(await fixture.series.currentStakingIndex())
      ).to.equal(fixture.seasonOne.address)
    })

    it('lets charlie unstake on SeasonOne but receives no rewards', async function () {
      await mineUntilTime(endTime)

      const receipt = await expectSuccess(
        fixture.series.connect(users.charlie.signer).unstake()
      )
      const paidEvs = receipt.logs.filter(
        (ev) => ev.topics[0] === REWARDS_SENT_TOPIC
      )
      expect(paidEvs).to.have.lengthOf(0)
    })

    it('lets alice unstake on SeasonOne after claim end and receives no rewards', async function () {
      await mineUntilTime(claimEndTime)

      const receipt = await expectSuccess(
        fixture.series.connect(users.alice.signer).unstake()
      )
      const paidEvs = receipt.logs.filter(
        (ev) => ev.topics[0] === REWARDS_SENT_TOPIC
      )
      expect(paidEvs).to.have.lengthOf(0)
    })
  })

  describe('Rewards paid if unstake in rolled over Season', () => {
    const totalRewards = ONE_ETH.mul(3)
    let fixture,
      snapshotID,
      users = {
        alice: null,
        bob: null,
        charlie: null,
        diana: null,
        elaine: null
      },
      userStake

    before(async function () {
      snapshotID = await snapshot()
      await deployments.fixture()

      fixture = await loadFixture(stakingFixture)
      users = fixture.users
      userStake = fixture.userStake
    })

    after(async function () {
      await rollback(snapshotID)
    })

    it('lets alice stakes', async function () {
      await userStake(users.alice)
      await mineBlocks(100)
    })

    it('lets bob stake', async function () {
      await userStake(users.bob)
      await mineBlocks(100)
    })

    it('Season one ends and season two should entered lock period', async function () {
      // Setup SeasonTwo
      await expectSuccess(
        fixture.series
          .connect(fixture.deployer)
          .pushSeason(fixture.seasonTwo.address)
      )

      // Drop some rewards
      await expectSuccess(
        fixture.master.sendTransaction({
          to: fixture.feeVault.address,
          value: totalRewards
        })
      )

      // SeasonTwo is over
      await mineUntilTime((await fixture.seasonTwo.endTime()).add(60 * 60))

      // To make sure it gets bootstrapped
      await userStake(users.charlie)
    })

    it('lets bob unstake on Season two and receives season two rewards', async function () {
      expect(await fixture.series.currentClaimingIndex()).to.equal(0)
      const beforeBalance = await users.bob.signer.getBalance()
      expect(await fixture.seasonTwo.getPoints(users.bob.address)).to.be.above(
        0
      )
      expect(await fixture.series.balanceOf(users.bob.address)).to.equal(
        ONE_THOUSAND_OGN
      )
      const receipt = await expectSuccess(
        fixture.series.connect(users.bob.signer).unstake()
      )
      // claiming index should have advanced
      expect(await fixture.series.currentClaimingIndex()).to.equal(1)
      const afterBalance = await users.bob.signer.getBalance()
      expect(await fixture.series.balanceOf(users.bob.address)).to.equal(0)
      expect(
        afterBalance
          .sub(beforeBalance)
          .add(receipt.gasUsed.mul(receipt.effectiveGasPrice))
      ).to.equal(totalRewards.div(2))
    })
  })

  describe('No stakes in season two', () => {
    const totalRewards = ONE_ETH.mul(3)
    let fixture,
      snapshotID,
      users = {
        alice: null,
        bob: null,
        charlie: null,
        diana: null,
        elaine: null
      },
      userStake

    before(async function () {
      snapshotID = await snapshot()
      await deployments.fixture()

      fixture = await loadFixture(stakingFixture)
      users = fixture.users
      userStake = fixture.userStake
    })

    after(async function () {
      await rollback(snapshotID)
    })

    it('lets alice stakes', async function () {
      await userStake(users.alice)
      await mineBlocks(100)
    })

    it('lets bob stake', async function () {
      await userStake(users.bob)
      await mineBlocks(100)
    })

    it('Season one ends and season two should entered lock period', async function () {
      // Setup SeasonTwo
      await expectSuccess(
        fixture.series
          .connect(fixture.deployer)
          .pushSeason(fixture.seasonTwo.address)
      )

      // Drop some rewards
      await expectSuccess(
        fixture.master.sendTransaction({
          to: fixture.feeVault.address,
          value: totalRewards
        })
      )

      // SeasonTwo is over
      await mineUntilTime((await fixture.seasonTwo.endTime()).add(60 * 60))
    })

    it('lets fails when bob tries to unstake on Season two', async function () {
      expect(await fixture.series.currentClaimingIndex()).to.equal(0)
      const beforeBalance = await users.bob.signer.getBalance()
      expect(await fixture.seasonTwo.getPoints(users.bob.address)).to.be.above(
        0
      )
      expect(await fixture.series.balanceOf(users.bob.address)).to.equal(
        ONE_THOUSAND_OGN
      )
      await expect(
        fixture.series.connect(users.bob.signer).unstake()
      ).to.be.revertedWith('Season: Season not bootstrapped.')
    })

    it('allows governor to bootstrap season', async function () {
      // In our case, totalSupply is good but in the real world, probably not
      const totalStaked = await fixture.series.totalSupply()
      await expectSuccess(
        fixture.series.connect(fixture.deployer).bootstrapSeason(1, totalStaked)
      )
    })

    it('allows bob to unstake', async function () {
      await expectSuccess(fixture.series.connect(users.bob.signer).unstake())
    })
  })
})
