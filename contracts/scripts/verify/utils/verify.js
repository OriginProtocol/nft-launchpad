const hre = require('hardhat')

/**
 * Verifies contract on given network.
 * @returns {void}
 */
async function verifyContract(info) {
  const address = info.address
  const file = info.file
  const name = file.split('.sol')[0]
  const contract = `contracts/nft/${file}:${name}`
  const constructorArguments = [
    info.constructorArgs.name,
    info.constructorArgs.symbol,
    info.constructorArgs.baseUri
  ]
  if (info.doIt === true) {
    console.log(
      `Running etherscan verification for contract at address ${address} on network: ${info.network}`
    )
    await hre.run('verify:verify', {
      address,
      contract,
      constructorArguments
    })
  } else {
    console.log(`Would have verified address: ${address} on network: ${
      info.network
    } 
        with constructorArgs: ${constructorArguments}
        and headerArgs: ${Object.values(info.headerArgs)}`)
  }
}

module.exports = { verifyContract }
