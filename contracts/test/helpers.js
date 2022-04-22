const hre = require('hardhat')
const { createFixtureLoader } = require('ethereum-waffle')

const loadFixture = createFixtureLoader(
  [
    hre.ethers.provider.getSigner(0),
    hre.ethers.provider.getSigner(1),
    hre.ethers.provider.getSigner(2),
    hre.ethers.provider.getSigner(3),
    hre.ethers.provider.getSigner(4),
    hre.ethers.provider.getSigner(5),
    hre.ethers.provider.getSigner(6),
    hre.ethers.provider.getSigner(7),
    hre.ethers.provider.getSigner(8),
    hre.ethers.provider.getSigner(9)
  ],
  hre.ethers.provider
)

const getGas = async (tx) => {
  const receipt = await ethers.provider.getTransactionReceipt(tx.hash)
  return receipt.gasUsed.toString()
}

async function getSigForMintV5({
  signer,
  token,
  buyer,
  count,
  price,
  mintLimit,
  expires
}) {
  const net = await ethers.provider.getNetwork()

  const hash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [
        'uint',
        'address',
        'address',
        'address',
        'uint256',
        'uint256',
        'uint256',
        'uint256'
      ],
      [
        net.chainId,
        token.address,
        buyer,
        buyer,
        count,
        price,
        mintLimit,
        expires
      ]
    )
  )
  return await signer.signMessage(ethers.utils.arrayify(hash))
}

module.exports = {
  loadFixture,
  getGas,
  getSigForMintV5
}
