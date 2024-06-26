/*global process*/

const { ethers } = require("ethers");

async function main() {
    const ALCHEMY_API_KEY_GOERLI = process.env.ALCHEMY_API_KEY_GOERLI;
    const goerliURL = "https://eth-goerli.g.alchemy.com/v2/" + ALCHEMY_API_KEY_GOERLI;
    const goerliProvider = new ethers.providers.JsonRpcProvider(goerliURL);
    await goerliProvider.getBlockNumber().then((result) => {
        console.log("Current block number goerli: " + result);
    });

    const chiadoURL = "https://rpc.chiadochain.net";
    const chiadoProvider = new ethers.providers.JsonRpcProvider(chiadoURL);
    await chiadoProvider.getBlockNumber().then((result) => {
        console.log("Current block number chiado: " + result);
    });

    const fs = require("fs");
    // AMBProxy address on goerli
    const AMBProxyAddress = "0x87A19d769D875964E9Cd41dDBfc397B2543764E6";
    const AMBProxyJSON = "abis/test/EternalStorageProxy.json";
    let contractFromJSON = fs.readFileSync(AMBProxyJSON, "utf8");
    const AMBProxyABI = JSON.parse(contractFromJSON);
    const AMBProxy = new ethers.Contract(AMBProxyAddress, AMBProxyABI, goerliProvider);

    // Test deployed HomeMediator address on chiado
    const homeMediatorAddress = "0x0a50009D55Ed5700ac8FF713709d5Ad5fa843896";
    const homeMediatorJSON = "artifacts/contracts/bridges/HomeMediator.sol/HomeMediator.json";
    contractFromJSON = fs.readFileSync(homeMediatorJSON, "utf8");
    let parsedFile = JSON.parse(contractFromJSON);
    const homeMediatorABI = parsedFile["abi"];
    const homeMediator = new ethers.Contract(homeMediatorAddress, homeMediatorABI, chiadoProvider);

    // Mock Timelock contract address on goerli (has AMBProxy address in it already)
    const mockTimelockAddress = "0x5b03476a21e9c7cEB8dB1Bd9F24664e480FDcc43";
    const mockTimelockJSON = "artifacts/contracts/bridges/test/MockTimelock.sol/MockTimelock.json";
    contractFromJSON = fs.readFileSync(mockTimelockJSON, "utf8");
    parsedFile = JSON.parse(contractFromJSON);
    const mockTimelockABI = parsedFile["abi"];
    const mockTimelock = new ethers.Contract(mockTimelockAddress, mockTimelockABI, goerliProvider);

    // Get the EOA
    const account = ethers.utils.HDNode.fromMnemonic(process.env.TESTNET_MNEMONIC).derivePath("m/44'/60'/0'/0/0");
    const EOAgoerli = new ethers.Wallet(account, goerliProvider);
    const EOAchiado = new ethers.Wallet(account, chiadoProvider);
    console.log("EOA address",EOAgoerli.address);
    if (EOAchiado.address == EOAgoerli.address) {
        console.log("Correct wallet setup");
    }

    // Home Mediator to change the foreign governor address
    const rawPayload = homeMediator.interface.encodeFunctionData("changeForeignGovernor", [EOAchiado.address]);
    // Pack the second part of data
    const target = homeMediatorAddress;
    const value = 0;
    const payload = ethers.utils.arrayify(rawPayload);
    const data = ethers.utils.solidityPack(
        ["address", "uint96", "uint32", "bytes"],
        [target, value, payload.length, payload]
    );

    // Build the final payload to be passed from the imaginary Timelock
    const mediatorPayload = await homeMediator.interface.encodeFunctionData("processMessageFromForeign", [data]);
    const requestGasLimit = "2000000";
    const timelockPayload = await AMBProxy.interface.encodeFunctionData("requireToPassMessage", [homeMediatorAddress,
        mediatorPayload, requestGasLimit]);

    // Send the message to chiado receiver
    const tx = await mockTimelock.connect(EOAgoerli).execute(timelockPayload);
    console.log("Timelock data execution hash", tx.hash);
    await tx.wait();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
