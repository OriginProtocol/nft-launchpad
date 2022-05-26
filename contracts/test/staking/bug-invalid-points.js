const { expect } = require('chai')

const { deployWithConfirmation } = require('../../utils/deploy')

const { stakingFixture } = require('../_fixture')
const {
  ONE_THOUSAND_OGN,
  loadFixture,
  snapshot,
  rollback
} = require('../helpers')

describe('Staking Bug - More points of repeat stakes', () => {
  let fundOGN, fixture, snapshotId, attack

  before(async function () {
    snapshotId = await snapshot()
    await deployments.fixture()

    fixture = await loadFixture(stakingFixture)
    fundOGN = fixture.fundOGN

    await deployWithConfirmation('SeasonPointsAttack', [
      fixture.series.address,
      fixture.mockOGN.address
    ])

    attack = await ethers.getContract('SeasonPointsAttack')
  })

  after(async function () {
    await rollback(snapshotId)
  })

  it('attack contract reverts', async function () {
    // Give the attack contract 1m OGN
    await fundOGN(attack.address, ONE_THOUSAND_OGN.mul(1000))

    await expect(attack.execute()).to.be.revertedWith(
      'SeasonPointsAttack: Unexpected points totals'
    )
  })
})
