const hre = require('hardhat')

async function defaultFixture() {
  await deployments.fixture()

  const { deployerAddr, signerAddr, masterAddr } = await getNamedAccounts()

  const MockDAI = await ethers.getContract('MockDAI')
  const MockOUSD = await ethers.getContract('MockOUSD')
  const MockUSDC = await ethers.getContract('MockUSDC')
  const MockUSDT = await ethers.getContract('MockUSDT')

  //manual deploy for now
  await deployments.deploy('OriginERC721_v1', {
    from: masterAddr,
    args: [
      'Ultraviolet Vinyl Collection by 3LAU',
      'UVCOLLECTION',
      'https://nft.3lau.com/nft/'
    ]
  })

  //manual deploy for now
  await deployments.deploy('OriginERC721_v2', {
    from: masterAddr,
    args: ["Franck's Toys", 'FRANC', 'https://nft.franck.com/nft/']
  })

  //manual deploy for now
  await deployments.deploy('OriginERC721_v3', { from: masterAddr })
  await deployments.deploy('OriginERC721_v3Factory', { from: masterAddr })

  await deployments.deploy('OriginERC721_v4', { from: masterAddr })
  await deployments.deploy('OriginERC721_v4Factory', { from: masterAddr })

  await deployments.deploy('OriginERC721_v5', { from: masterAddr })
  await deployments.deploy('OriginERC721_v5Factory', { from: masterAddr })

  const dummyPolygonChainManagerAddress =
    '0x62CdCbfA146DF4961A039EB50d26bf89938A08de'
  await deployments.deploy('OriginPolygonERC721_v2', {
    from: deployerAddr,
    args: [
      'Polygon NFT',
      'POLYNFT',
      'https://nft.marck.com/nft/',
      dummyPolygonChainManagerAddress,
      masterAddr
    ]
  })
  await deployments.deploy('OriginPolygonERC721_v3', {
    from: deployerAddr,
    args: [
      'Origin NFT',
      'ORIGIN',
      'https://nft.origin.eth/nft/',
      dummyPolygonChainManagerAddress,
      masterAddr
    ]
  })

  await deployments.deploy('OriginERC721a_v1', {
    from: deployerAddr,
    args: [
      'Origin NFT',
      'ORIGIN',
      'https://nft.origin.eth/nft/',
      10,
      masterAddr,
      [masterAddr],
      [1]
    ]
  })

  await deployments.deploy('OriginERC721a_v2', {
    from: deployerAddr,
    args: [
      'Origin NFT',
      'ORIGIN',
      'https://nft.origin.eth/nft/',
      10,
      masterAddr,
      [masterAddr],
      [1]
    ]
  })

  const blau = await ethers.getContract('OriginERC721_v1')
  const nftv2 = await ethers.getContract('OriginERC721_v2')
  const nftv3 = await ethers.getContract('OriginERC721_v3')
  const nftv4 = await ethers.getContract('OriginERC721_v4')
  const nftv5 = await ethers.getContract('OriginERC721_v5')
  const nft721a = await ethers.getContract('OriginERC721a_v1')
  const nft721a_v2 = await ethers.getContract('OriginERC721a_v2')
  const factory = await ethers.getContract('OriginERC721_v3Factory')
  const factoryV4 = await ethers.getContract('OriginERC721_v4Factory')
  const factoryV5 = await ethers.getContract('OriginERC721_v5Factory')
  const polygonV2 = await ethers.getContract('OriginPolygonERC721_v2')
  const polygonV3 = await ethers.getContract('OriginPolygonERC721_v3')

  const master = await ethers.provider.getSigner(masterAddr)
  const deployer = await ethers.provider.getSigner(deployerAddr)

  await nftv3
    .connect(master)
    .initialize(
      masterAddr,
      masterAddr,
      "Franck's Toys",
      'FRANC',
      'https://nft.franck.com/nft/'
    )

  const ingestRegistry = await ethers.getContract('IngestRegistry')
  const ingestMasterProxy = await ethers.getContract('IngestMasterProxy')
  const ingestMaster = await ethers.getContractAt(
    'IngestMaster',
    ingestMasterProxy.address
  )

  const pool = await ethers.provider.getSigner(8)

  return {
    MockDAI,
    MockOUSD,
    MockUSDC,
    MockUSDT,
    blau,
    nftv2,
    nftv3,
    nftv4,
    nftv5,
    nft721a,
    nft721a_v2,
    factory,
    factoryV4,
    factoryV5,
    polygonV2,
    polygonV3,
    master,
    deployer,
    ingestRegistry,
    ingestMaster,
    pool
  }
}

module.exports = {
  defaultFixture
}
