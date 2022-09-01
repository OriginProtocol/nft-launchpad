/**
 * Mint MockOGN to addresses.
 *
 * Usage
 * -----
 * node mintOgn.js ADDRESS AMOUNT
 */
const hre = require('hardhat')

const { withConfirmation } = require('../utils/deploy')

async function main() {
  const [recipient_, amount_] = process.argv.slice(2)
  const amount = hre.ethers.BigNumber.from(amount_)
  const recipient = hre.ethers.utils.getAddress(recipient_)

  console.log(
    `Minting ${hre.ethers.utils.formatEther(amount)} OGN to ${recipient}`
  )

  const { deployerAddr } = await hre.getNamedAccounts()
  const deployer = await hre.ethers.provider.getSigner(deployerAddr)
  const ogn = await hre.ethers.getContract('MockOGN')
  await withConfirmation(ogn.connect(deployer).mint(recipient, amount))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
