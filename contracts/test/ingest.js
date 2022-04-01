const { expect } = require('chai')
const { defaultFixture } = require('./_fixture')
const { loadFixture, getGas } = require('./helpers')
const { parseUnits, formatUnits, formatBytes32String } = require('ethers').utils

describe('Ingest Contracts', () => {
  const _collect_batch = async (ingestMaster, coin, pool, salts, amounts) => {
    const collectCoins = []
    let totalAmount = parseUnits('0', 18) //TODO: use coin.decimals
    // 1. Send fund
    for (let i = 0; i < salts.length; i++) {
      const ep = await ingestMaster.getAddress(salts[i])
      await coin.mint(ep, amounts[i])
      collectCoins.push(coin.address)
      totalAmount = totalAmount.add(amounts[i])
    }
    // 2. Collect all at once
    const poolAddress = await pool.getAddress()
    const before_pool_balance = await coin.balanceOf(poolAddress)
    const tx = await ingestMaster.collectBatch(salts, collectCoins, amounts)
    const after_pool_balance = await coin.balanceOf(poolAddress)
    expect(after_pool_balance.sub(before_pool_balance)).to.be.equal(totalAmount)
    return tx
  }

  it('Can collect Stable Coin after deploy', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const salt = formatBytes32String('a salt')

    let tx
    const endpointAddress = await ingestMaster.getAddress(salt)
    const poolAddress = await pool.getAddress()
    const amount = parseUnits('100', 18)
    // First collect will create endpoint contract
    await MockUSDT.mint(endpointAddress, amount)
    expect(await MockUSDT.balanceOf(endpointAddress)).to.be.equal(amount)
    tx = await ingestMaster.collect(salt, MockUSDT.address, amount)
    console.log('⛽️ Collect with deploy: gas used', await getGas(tx))
    //Second collect will use existing contract
    await MockUSDT.mint(endpointAddress, amount)
    const before_pool_balance = await MockUSDT.balanceOf(poolAddress)
    tx = await ingestMaster.collect(salt, MockUSDT.address, amount)
    console.log('⛽️ Collect only: gas used', await getGas(tx))
    const after_pool_balance = await MockUSDT.balanceOf(poolAddress)
    expect(after_pool_balance.sub(before_pool_balance)).to.be.equal(amount)
  })

  it('Can collect eth', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const salt = formatBytes32String('another salt')

    const endpointAddress = await ingestMaster.getAddress(salt)
    const poolAddress = await pool.getAddress()

    expect(await ethers.provider.getBalance(endpointAddress)).to.be.equal(0)
    await master.sendTransaction({ to: endpointAddress, value: 123 })
    expect(await ethers.provider.getBalance(endpointAddress)).to.be.equal(123)
    const before_pool_balance = await ethers.provider.getBalance(poolAddress)
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
    await ingestMaster.collect(salt, ETH, 123)
    const after_pool_balance = await ethers.provider.getBalance(poolAddress)
    expect(after_pool_balance.sub(before_pool_balance)).to.be.equal(123)
  })

  it('Contract can receive eth with invalid inputData in tx', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, ingestMaster, pool } = fixture

    const depositor = ethers.provider.getSigner(9)
    const salt = formatBytes32String('another salt')

    const endpointAddress = await ingestMaster.getAddress(salt)
    const poolAddress = await pool.getAddress()
    const amtEth = parseUnits('123', 18)
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

    // Send ETH to EOA
    expect(await ethers.provider.getBalance(endpointAddress)).to.be.equal(0)
    const tx1 = await depositor.sendTransaction({
      to: endpointAddress,
      value: amtEth,
      data: '0x00'
    })
    await tx1.wait()
    expect(await ethers.provider.getBalance(endpointAddress)).to.be.equal(
      amtEth
    )

    // Run collect to create contract and transfer assets
    const before_tx1_pool_balance = await ethers.provider.getBalance(
      poolAddress
    )
    await ingestMaster.collect(salt, ETH, amtEth)

    const after_tx1_pool_balance = await ethers.provider.getBalance(poolAddress)
    expect(after_tx1_pool_balance.sub(before_tx1_pool_balance)).to.be.equal(
      amtEth
    )

    expect(await ethers.provider.getBalance(endpointAddress)).to.be.equal(0)
    // Send ETH to Contract
    const tx2 = await depositor.sendTransaction({
      to: endpointAddress,
      value: amtEth,
      data: '0x00'
    })
    await tx2.wait()
    expect(await ethers.provider.getBalance(endpointAddress)).to.be.equal(
      amtEth
    )

    await ingestMaster.collect(salt, ETH, amtEth)

    const after_tx2_pool_balance = await ethers.provider.getBalance(poolAddress)
    expect(after_tx2_pool_balance.sub(before_tx1_pool_balance)).to.be.equal(
      amtEth.mul(2)
    )
  })

  it('Will fail on collect with no transfer', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const salt = formatBytes32String('no transfer salt')

    const endpointAddress = await ingestMaster.getAddress(salt)
    const poolAddress = await pool.getAddress()

    expect(await ethers.provider.getBalance(endpointAddress)).to.be.equal(0)
    await master.sendTransaction({ to: endpointAddress, value: 123 })
    expect(await ethers.provider.getBalance(endpointAddress)).to.be.equal(123)
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

    // set it to something that can't take eth
    await ingestRegistry.setPool(MockUSDT.address)
    await expect(ingestMaster.collect(salt, ETH, 123)).to.be.reverted
  })

  it('Can collect batch', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const salts = [
      formatBytes32String('1'),
      formatBytes32String('2'),
      formatBytes32String('3'),
      formatBytes32String('4')
    ]
    const amounts = [
      parseUnits('0.00000001', 18),
      parseUnits('0.00005', 18),
      parseUnits('1', 18),
      parseUnits('100000000', 18)
    ]
    const tx = await _collect_batch(
      ingestMaster,
      MockUSDT,
      pool,
      salts,
      amounts
    )
    console.log('⛽️ Deploy and collect 4x: gas used', await getGas(tx))
  })

  it('Can collect batch same salt', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const salts = [formatBytes32String('1'), formatBytes32String('1')]
    const amounts = [parseUnits('0.00000001', 18), parseUnits('500', 18)]
    const tx = await _collect_batch(
      ingestMaster,
      MockUSDT,
      pool,
      salts,
      amounts
    )
    console.log(
      '⛽️ Deploy and collect 2x same salt: gas used',
      await getGas(tx)
    )
  })

  it('Cannot collect with bad args', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const salts = [
      formatBytes32String('1'),
      formatBytes32String('2'),
      formatBytes32String('3'),
      formatBytes32String('4')
    ]
    const coins = [
      MockUSDT.address,
      MockUSDT.address,
      MockUSDT.address,
      MockUSDT.address
    ]
    const amounts = [
      parseUnits('0.00000001', 18),
      parseUnits('0.00005', 18),
      parseUnits('1', 18),
      parseUnits('100000000', 18)
    ]

    await expect(
      ingestMaster.collectBatch(salts, coins.slice(2), amounts)
    ).to.be.revertedWith('Assets length must match')

    await expect(
      ingestMaster.collectBatch(salts, coins, amounts.slice(2))
    ).to.be.revertedWith('Amounts length must match')
  })

  it('Only IngestMaster can collect', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const randomUser = ethers.provider.getSigner(11)

    const salt = formatBytes32String('a salt')

    let tx
    const endpointAddress = await ingestMaster.getAddress(salt)
    const poolAddress = await pool.getAddress()
    const amount = parseUnits('100', 18)
    // First collect will create endpoint contract
    await MockUSDT.mint(endpointAddress, amount)
    // actually deploy this...
    await ingestMaster.collect(salt, MockUSDT.address, amount)

    await MockUSDT.mint(endpointAddress, amount)
    const endpoint = await ethers.getContractAt('IngestImpl', endpointAddress)

    await expect(
      endpoint.connect(randomUser).collect(MockUSDT.address, amount)
    ).to.be.revertedWith('Endpoint: Caller is not the master')
  })

  it('Can change pool', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const salt = formatBytes32String('a salt')

    let tx
    const endpointAddress = await ingestMaster.getAddress(salt)
    const poolAddress = await pool.getAddress()
    const amount = parseUnits('100', 18)
    // First collect will create endpoint contract
    await MockUSDT.mint(endpointAddress, amount)
    expect(await MockUSDT.balanceOf(poolAddress)).to.be.equal(0)
    await ingestMaster.collect(salt, MockUSDT.address, amount)
    expect(await MockUSDT.balanceOf(poolAddress)).to.be.equal(amount)

    const newPool = ethers.provider.getSigner(11)

    const newPoolAddress = await newPool.getAddress()
    await ingestRegistry.setPool(newPoolAddress)

    await MockUSDT.mint(endpointAddress, amount)

    expect(await MockUSDT.balanceOf(newPoolAddress)).to.be.equal(0)
    await ingestMaster.collect(salt, MockUSDT.address, amount)
    expect(await MockUSDT.balanceOf(newPoolAddress)).to.be.equal(amount)
  })

  it('Can change Collector', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const salt = formatBytes32String('a salt')

    const newCollector = ethers.provider.getSigner(11)
    const newCollectorAddress = await newCollector.getAddress()

    await expect(
      ingestMaster.connect(newCollector).setCollector(newCollectorAddress)
    ).to.be.revertedWith('Caller is not the Governor')
    ingestMaster.setCollector(newCollectorAddress)

    let tx
    const endpointAddress = await ingestMaster.getAddress(salt)
    const poolAddress = await pool.getAddress()
    const amount = parseUnits('100', 18)
    // First collect will create endpoint contract
    await MockUSDT.mint(endpointAddress, amount)
    await expect(
      ingestMaster.collect(salt, MockUSDT.address, amount)
    ).to.be.revertedWith('Master: Caller is not the Collector')
    await ingestMaster
      .connect(newCollector)
      .collect(salt, MockUSDT.address, amount)
  })

  it('Can change registry', async () => {
    const fixture = await loadFixture(defaultFixture)
    const { MockUSDT, blau, master, ingestRegistry, ingestMaster, pool } =
      fixture

    const newMaster = ethers.provider.getSigner(11)
    const newMasterAddress = await newMaster.getAddress()
    const newImpl = ethers.provider.getSigner(11)
    const newImplAddress = await newImpl.getAddress()

    await ingestRegistry.setEndpointImplementation(newImplAddress)
    expect(await ingestRegistry.endpointImplementation()).to.be.equal(
      newImplAddress
    )
    await ingestRegistry.setMaster(newMasterAddress)
    expect(await ingestRegistry.master()).to.be.equal(newMasterAddress)
  })

  it('Will not function unless initialized', async () => {
    // Funds will be permanently lost if the master has not been initialized
    // Add a check so that the master will not return an address to send funds
    // to unless initialization has happened.
    const masterFactory = await ethers.getContractFactory('IngestMaster')
    const freshMaster = await masterFactory.deploy()
    const salt = formatBytes32String('a salt')
    await expect(freshMaster.getAddress(salt)).to.be.revertedWith(
      'MidProxy must be set'
    )
  })
})
