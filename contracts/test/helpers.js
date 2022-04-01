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

module.exports = {
  loadFixture,
  getGas
}
