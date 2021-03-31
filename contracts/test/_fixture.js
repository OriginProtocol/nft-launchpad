const hre = require("hardhat");

async function defaultFixture() {
  await deployments.fixture();

  const {  deployerAddr, signerAddr, masterAddr } = await getNamedAccounts()

  const MockDAI = await ethers.getContract('MockDAI')
  const MockOUSD = await ethers.getContract('MockOUSD')
  const MockUSDC = await ethers.getContract('MockUSDC')
  const MockUSDT = await ethers.getContract('MockUSDT')

  const master = await ethers.provider.getSigner(masterAddr)

  const ingestRegistry = await ethers.getContract('IngestRegistry')
  const ingestMasterProxy = await ethers.getContract('IngestMasterProxy')
  const ingestMaster = await ethers.getContractAt("IngestMaster", ingestMasterProxy.address)

  const pool = await ethers.provider.getSigner(8)

  return {
      MockDAI,
      MockOUSD,
      MockUSDC,
      MockUSDT,
      master,
      ingestRegistry,
      ingestMaster,
      pool
  }
}

module.exports = {
  defaultFixture
}
