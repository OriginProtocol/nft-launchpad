const { expect } = require('chai')

const { deployWithConfirmation } = require('../../utils/deploy')

const { stakingFixture } = require('../_fixture')
const {
  ONE_ETH,
  ONE_THOUSAND_OGN,
  BURN_ADDRESS,
  ZERO_ADDRESS,
  blockStamp,
  expectSuccess,
  loadFixture,
  mineBlocks,
  mineUntilTime,
  roughlyEqual,
  snapshot,
  rollback
} = require('../helpers')
const {
  ASSET_ETH_TOPIC,
  REWARDS_COLLECTED_TOPIC,
  REWARDS_PAID_TOPIC
} = require('./_const')

const abiCoder = ethers.utils.defaultAbiCoder
const oneHundredTwentyDays = 60 * 60 * 24 * 120
const oneDay = 60 * 60 * 24

// Check that things mechanically work
describe('Staking Scenarios', () => {
  describe('5 equal stakers over time', () => {
    const totalRewards = ONE_ETH.mul(123)
    let fixture,
      endTime,
      lockPeriod,
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

      endTime = await fixture.seasonOne.endTime()
      const claimPeriod = await fixture.seasonOne.claimPeriod()
      lockPeriod = await fixture.seasonOne.lockPeriod()

      await deployWithConfirmation('SeasonTwo', [
        fixture.series.address,
        endTime,
        endTime.add(oneHundredTwentyDays),
        claimPeriod,
        lockPeriod
      ])

      const seasonOneStart = await fixture.seasonOne.startTime()
      await mineUntilTime(seasonOneStart.add(60 * 60))
      const now = await blockStamp()
      expect(seasonOneStart).to.be.below(now)
    })

    after(async function () {
      await rollback(snapshotID)
    })

    it('lets alice stake', async function () {
      await userStake(users.alice)
      const stamp = await blockStamp()
      await mineUntilTime(stamp + oneDay)
    })

    it('lets bob stake', async function () {
      const stamp = await blockStamp()
      await userStake(users.bob)
      await mineUntilTime(stamp + oneDay * 3)
    })

    it('lets charlie stake', async function () {
      await userStake(users.charlie)
      const stamp = await blockStamp()
      await mineUntilTime(stamp + oneDay * 5)
    })

    it('lets diana stake', async function () {
      await userStake(users.diana)
      const stamp = await blockStamp()
      await mineUntilTime(stamp + oneDay * 14)
    })

    it('lets elaine stake', async function () {
      await userStake(users.elaine)
      const stamp = await blockStamp()
      await mineUntilTime(stamp + oneDay * 30)
    })

    it('has sane staked amounts', async function () {
      const addresses = Object.keys(users).map((k) => users[k].address)
      let totalStaked = ethers.BigNumber.from(0)
      for (const address of addresses) {
        const staked = await fixture.stOGN.balanceOf(address)
        expect(staked).to.equal(ONE_THOUSAND_OGN)
        totalStaked = totalStaked.add(staked)
      }
      expect(await fixture.stOGN.totalSupply()).to.equal(totalStaked)
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

    it('has sane stOGN balances', async function () {
      const addresses = Object.keys(users).map((k) => users[k].address)
      for (const address of addresses) {
        expect(await fixture.stOGN.balanceOf(address)).to.equal(
          ONE_THOUSAND_OGN
        )
      }
    })

    it(`should not allow new stakes after lock period`, async function () {
      const contractLockPeriod = (
        await fixture.seasonOne.lockPeriod()
      ).toNumber()
      expect(contractLockPeriod).to.equal(lockPeriod)

      // Push us into the lock period
      await mineUntilTime(endTime - lockPeriod + 100)

      await fundOGN(users.alice.address, ONE_THOUSAND_OGN)
      await allowOGN(
        users.alice.signer,
        fixture.series.address,
        ONE_THOUSAND_OGN
      )
      await expect(
        fixture.series.connect(users.alice.signer).stake(ONE_THOUSAND_OGN)
      ).to.be.revertedWith('Series: No available season for staking')

      // Burn the OGN just so following balance chekcs function
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
      const rewardsOGN = ONE_THOUSAND_OGN.mul('100')
      await fundOGN(fixture.seasonOne.address, rewardsOGN)
      expect(
        await fixture.mockOGN.balanceOf(fixture.seasonOne.address)
      ).to.equal(rewardsOGN)

      // Setup SeasonTwo
      await expectSuccess(
        fixture.series
          .connect(fixture.deployer)
          .pushSeason(fixture.seasonTwo.address)
      )

      // Wrap up the season
      await mineUntilTime(endTime)

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
            ev.topics[0] === REWARDS_PAID_TOPIC &&
            ev.topics[1] === ASSET_ETH_TOPIC
        )[0]
        const paidOGNEv = receipt.logs.filter(
          (ev) =>
            ev.topics[0] === REWARDS_PAID_TOPIC &&
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
        expect(await fixture.stOGN.balanceOf(user.address)).to.equal(0)

        // Verify rewards were paid
        const balanceETH = await ethers.provider.getBalance(user.address)
        const expectedETH = user.originalBalanceETH.add(paidETH)
        const balanceOGN = await fixture.mockOGN.balanceOf(user.address)
        const expectedOGN = user.originalBalanceOGN.add(paidOGN)

        // rough equality because of gas fees
        expect(roughlyEqual(balanceETH, expectedETH)).to.be.true
        expect(roughlyEqual(balanceOGN, expectedOGN)).to.be.true

        await mineBlocks(1)

        // An unstake after season end should trigger transfer from vault
        expect(
          await ethers.provider.getBalance(fixture.feeVault.address)
        ).to.equal(0)
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
      expect(vaultBalance).to.equal(0)
      /**
       * TODO: There's dust of 2wei left-over in this test.  Need to figure
       * out what to do about it.
       */
      expect(seasonOneBalance).to.be.below(100)
      expect(totalPaid.add(seasonOneBalance)).to.equal(totalRewards)
      //expect(seasonOneBalance).to.equal(0)
      //expect(totalPaid).to.equal(totalRewards)
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
        const days = Math.floor((endTime - users[user].timestamp) / oneDay)
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
      const claimPeriod = await fixture.seasonOne.claimPeriod()
      const lockPeriod = await fixture.seasonOne.lockPeriod()

      await deployWithConfirmation('SeasonTwo', [
        fixture.series.address,
        endTime,
        endTime.add(oneHundredTwentyDays),
        claimPeriod,
        lockPeriod
      ])
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

    it('lets bob unstake from SeasonOne', async function () {
      await expectSuccess(fixture.series.connect(users.bob.signer).unstake())

      // Setup SeasonTwo
      await expectSuccess(
        fixture.series.connect(deployer).pushSeason(fixture.seasonTwo.address)
      )

      // SeasonOne is over
      await mineUntilTime(endTime)

      // Should only be 1k left from Alice
      expect(await fixture.stOGN.totalSupply()).to.equal(ONE_THOUSAND_OGN)
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
      expect(await fixture.stOGN.totalSupply()).to.equal(
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
      const claimPeriod = await fixture.seasonOne.claimPeriod()
      const lockPeriod = await fixture.seasonOne.lockPeriod()

      await deployWithConfirmation('SeasonTwo', [
        fixture.series.address,
        endTime,
        endTime.add(oneHundredTwentyDays),
        claimPeriod,
        lockPeriod
      ])
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

      // Previous season should still be zero
      expect(await fixture.series.previousSeason()).to.equal(ZERO_ADDRESS)

      // SeasonOne is over
      await mineUntilTime(endTime)
    })

    it('lets charlie stake on SeasonTwo', async function () {
      await userStake(users.charlie)

      // Previous season should now be SeasonOne
      expect(await fixture.series.previousSeason()).to.equal(
        fixture.seasonOne.address
      )
    })

    it('lets bob unstake from SeasonOne', async function () {
      expect(await fixture.stOGN.totalSupply()).to.equal(
        ONE_THOUSAND_OGN.mul(3)
      )

      await expectSuccess(fixture.series.connect(users.bob.signer).unstake())

      // Should only be 1k left from Alice
      expect(await fixture.stOGN.totalSupply()).to.equal(
        ONE_THOUSAND_OGN.mul(2)
      )
    })

    it('is has sane values of rolled over stakes', async function () {
      expect(await fixture.stOGN.totalSupply()).to.equal(
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
      nobody,
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
      nobody = fixture.nobody

      endTime = await fixture.seasonOne.endTime()
      const claimPeriod = await fixture.seasonOne.claimPeriod()
      const lockPeriod = await fixture.seasonOne.lockPeriod()

      await deployWithConfirmation('SeasonTwo', [
        fixture.series.address,
        endTime,
        endTime.add(oneHundredTwentyDays),
        claimPeriod,
        lockPeriod
      ])
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

    it('(noop) end season', async function () {
      await expectSuccess(
        fixture.master.sendTransaction({
          to: fixture.feeVault.address,
          value: ONE_ETH
        })
      )

      // Send some OGN rewards to the season as well
      const rewardsOGN = ONE_THOUSAND_OGN.mul('100')
      await fundOGN(fixture.seasonOne.address, rewardsOGN)
      expect(
        await fixture.mockOGN.balanceOf(fixture.seasonOne.address)
      ).to.equal(rewardsOGN)

      // Setup SeasonTwo
      await expectSuccess(
        fixture.series.connect(deployer).pushSeason(fixture.seasonTwo.address)
      )

      // SeasonOne is over
      await mineUntilTime(endTime)
    })

    it('lets alice collect rewards', async function () {
      const user = users.alice

      const endTime = await fixture.seasonOne.endTime()
      const claimPeriod = await fixture.seasonOne.claimPeriod()
      const now = await blockStamp()
      expect(now).to.be.above(endTime)
      expect(now).to.be.below(endTime.add(claimPeriod))

      const [expectedETHCalculated, expectedOGNCalculated] =
        await fixture.seasonOne.expectedRewards(user.address)
      const receipt = await expectSuccess(
        fixture.series.claimRewards(user.address)
      )

      const collectedEv = receipt.logs.filter(
        (ev) => ev.topics[0] === REWARDS_COLLECTED_TOPIC
      )[0]
      const collectedETH = abiCoder.decode(['uint256'], collectedEv.data)[0]
      expect(collectedETH).to.equal(ONE_ETH)

      const paidETHEv = receipt.logs.filter(
        (ev) =>
          ev.topics[0] === REWARDS_PAID_TOPIC &&
          ev.topics[1] === ASSET_ETH_TOPIC
      )[0]
      const paidOGNEv = receipt.logs.filter(
        (ev) =>
          ev.topics[0] === REWARDS_PAID_TOPIC &&
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
      expect(await fixture.stOGN.balanceOf(user.address)).to.equal(
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

    it('refunds the vault after claim period', async function () {
      await expect(
        fixture.seasonOne.connect(nobody).wrapUp()
      ).to.be.revertedWith('SeasonOne: Claim period not over')

      const seasonETH = await ethers.provider.getBalance(
        fixture.seasonOne.address
      )
      const seasonOGN = await fixture.mockOGN.balanceOf(
        fixture.seasonOne.address
      )

      const claimPeriodEnd = (await fixture.seasonOne.claimPeriod()).toNumber()
      await mineUntilTime(endTime + claimPeriodEnd)

      await expectSuccess(fixture.seasonOne.connect(nobody).wrapUp())

      expect(
        await ethers.provider.getBalance(fixture.feeVault.address)
      ).to.equal(seasonETH)
      expect(
        await fixture.mockOGN.balanceOf(fixture.seasonTwo.address)
      ).to.equal(seasonOGN)
    })
  })

  describe('should pre-stake in SeasonTwo when SeasonOne in lock period', () => {
    let fixture,
      deployer,
      endTime,
      lockPeriod,
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
      deployer = fixture.deployer

      endTime = await fixture.seasonOne.endTime()
      const claimPeriod = await fixture.seasonOne.claimPeriod()
      lockPeriod = await fixture.seasonOne.lockPeriod()

      await deployWithConfirmation('SeasonTwo', [
        fixture.series.address,
        endTime,
        endTime.add(oneHundredTwentyDays),
        claimPeriod,
        lockPeriod
      ])
      fixture.seasonTwo = await ethers.getContract('SeasonTwo')

      const initialSupply = await fixture.stOGN.totalSupply()
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
      expect(await fixture.stOGN.totalSupply()).to.equal(ONE_THOUSAND_OGN)
    })

    it('lets bob stake', async function () {
      await userStake(users.bob)
      expect(await fixture.seasonOne.getTotalPoints()).to.equal(
        users.alice.points.add(users.bob.points)
      )
      await mineBlocks(100)
      expect(await fixture.stOGN.totalSupply()).to.equal(
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
      await mineUntilTime(endTime.sub(lockPeriod))
    })

    it('charlie pre-stake in season two', async function () {
      const supplyBeforeStake = await fixture.stOGN.totalSupply()
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

      const oneDays = ethers.BigNumber.from(60 * 60 * 24)
      const stakeDays = ethers.BigNumber.from(oneHundredTwentyDays).div(oneDays)
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

      // Bob should've had more points in season two
      const seasonOnePointsAfter = await fixture.seasonOne.getTotalPoints()
      const seasonTwoPointsAfter = await fixture.seasonTwo.getTotalPoints()
      expect(seasonOnePointsAfter).to.equal(
        seasonOnePoints.sub(users.bob.points)
      )
      expect(seasonTwoPointsAfter).to.be.below(
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
      expect(seasonTwoPointsAfter).to.be.below(
        seasonTwoPoints.sub(users.bob.points)
      )
    })
  })
})
