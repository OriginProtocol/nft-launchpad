const hre = require('hardhat')

const isRinkeby = hre.network.name === 'rinkeby'
const isMainnet = hre.network.name === 'mainnet'
const { placeholders } = require('../ingest.config.js')

const deployContracts = async ({ getNamedAccounts, deployments }) => {
  const { deploy, getArtifact } = deployments
  const { deployerAddr, poolAddr } = await getNamedAccounts()
  const deployer = await ethers.provider.getSigner(deployerAddr);

  const replaceBytecodeAddress = async (bytecode, contractName) => {
    const placeholderAddress = placeholders[contractName].slice(2);
    const contractAddress = (await ethers.getContract(contractName)).address.slice(2).toLowerCase();
    return bytecode.replace(new RegExp(placeholderAddress, 'g'), contractAddress)
  }

  console.log('Running 001_ingest deployment...')

  await deploy("IngestRegistry", { from: deployerAddr})
  const registry = await ethers.getContract("IngestRegistry");
  console.log("Registry:", registry.address);
  const midProxyArtifact = await getArtifact("IngestMidProxy");
  await deploy("IngestMidProxy", { from: deployerAddr, 
    contract: 
      {abi:midProxyArtifact.abi, bytecode:await replaceBytecodeAddress(midProxyArtifact.bytecode, "IngestRegistry")}})
  const ingestMidProxy = await ethers.getContract("IngestMidProxy")

  const ingestMasterImpl = await deploy("IngestMaster", {from: deployerAddr});
  const ingestMasterProxy = await deploy("IngestMasterProxy", {from: deployerAddr, args:[ingestMasterImpl.address]})
  const ingestMaster = await ethers.getContractAt("IngestMaster", ingestMasterProxy.address);

  await ingestMaster.connect(deployer).initialize(ingestMidProxy.address);

  const ingestImplArtifact = await getArtifact("IngestImpl");
  const ingestImpl = await deploy("IngestImpl", { from: deployerAddr,
    contract:
      {abi:ingestImplArtifact.abi, bytecode:await replaceBytecodeAddress(ingestImplArtifact.bytecode, "IngestRegistry")}})

  console.log("ingestMaster.address:", ingestMaster.address)
  console.log("ingestImpl.address", ingestImpl.address)

  await registry.connect(deployer).setMaster(ingestMaster.address)
  await registry.connect(deployer).setEndpointImplimentation(ingestImpl.address)

  if (isRinkeby || isMainnet) {
    await registry.connect(deployer).setPool(process.env.INGEST_POOl_ADDRESS)
  } else {
    // on Dev use signer 8 as pool for tests
    const signerOne = await ethers.provider.getSigner(8)
    const poolAddress = await signerOne.getAddress()
    await registry.connect(deployer).setPool(poolAddress)
  } 

  console.log('Running 001_ingest deployment...')

  console.log('001_ingest deploy done.')

  return true
}

deployContracts.id = '001_ingest'
deployContracts.tags = ['ingest']
deployContracts.skip = () => isRinkeby || isMainnet

module.exports = deployContracts
