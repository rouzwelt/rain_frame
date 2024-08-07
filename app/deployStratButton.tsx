"use client";

import { ethers, Contract } from 'ethers';
import { useState } from 'react';
import { useEthersSigner } from './ethersToWagmi';

export const allAbis = [
    // used for getting parser address if not already known
    "function iParser() external view returns (address)", 

    // used for parsing rainlang for obv3
    "function parse(bytes calldata data) external view returns (bytes calldata bytecode, uint256[] calldata constants)",

    // orderbook v3 abis for adding order
    "function addOrder(((address token, uint8 decimals, uint256 vaultId)[] validInputs, (address token, uint8 decimals, uint256 vaultId)[] validOutputs, (address deployer, bytes bytecode, uint256[] constants) evaluableConfig, bytes meta) config) returns (bool stateChanged)",

    // for multicall
    "function multicall(bytes[] calldata data) external returns (bytes[] memory results)",

    // for depositing into a vault
    "function deposit(address token, uint256 vaultId, uint256 amount) external",

    // for withdrawing from vault, is pretty similar to deposit
    "function withdraw(address token, uint256 vaultId, uint256 targetAmount) external",

    "function vaultBalance(address owner, address token, uint256 vaultId) external view returns (uint256 balance)"
];

export const erc20Abi = [
    "function approve(address _spender, uint256 _value) public returns (bool success)"
]

export const deployerContractAddress = "0xd58583e0C5C00C6DCF0137809EA58E9d55A72d66";
export const orderbokContractAddress = "0xb06202aA3Fe7d85171fB7aA5f17011d17E63f382";

export const validInputs = [{
    token: "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d",
    decimals: "18",
    vaultId: "0xd995a9f40baabce2cdf6d783b2fe31bda4f8efa807703c0e3b0654aa6641874e",
}];
export const validOutputs = [{
    token: "0x96B41289D90444B8adD57e6F265DB5aE8651DF29",
    decimals: "6",
    vaultId: "0x4960001e20a2694253c51fbeba336e502314185d3765c53db84fce6af7224fbc",
}];

export default function DeployStratButton() {
    const [transactionHash, setTransactionHash] = useState(null);

    const encodeMeta = (data:any) => {
        return (
            "0x" +
            BigInt(0xff0a89c674ee7874n).toString(16).toLowerCase() +
            ethers.utils.hexlify(ethers.utils.toUtf8Bytes(data)).split("x")[1]
        );
    };

    const signer = useEthersSigner()!;
    const deployerContract = new ethers.Contract(deployerContractAddress, allAbis, signer);
    
    const orderbookContract = new Contract(orderbokContractAddress, allAbis, signer) as Contract & {
        addOrder: (config: any) => Promise<any>;
    };

    const rainlang = "using-words-from 0x31A76D8644612e0ABD1aF0D42909Ed57F16F608D 0xCE6ad0ba209e7D3B59Ddb8a63595193C11C3B0aB start-time: block-timestamp(),budget-per-day: 10,budget-per-second: div(budget-per-day 86400),time-elapsed: sub(now() start-time),budget-to-date: mul(time-elapsed budget-per-second),spent-so-far: get(order-hash()),spend-this-time: sub(budget-to-date spent-so-far),flr-usd: ftso-current-price-usd(\"FLR\" 3600),usd-flr: inv(flr-usd),max-output: spend-this-time,io-ratio: mul(0.9 usd-flr),:set(order-hash() add(spent-so-far spend-this-time)); :;";
    const rainlangAsBytes = ethers.utils.toUtf8Bytes(rainlang);

    const deployStrategy = async () => {
    // if not known, you can use the iParser() call to get them from deployerContract
    // // example: parserContractAddress = await deployerContract.iParser();
    const parserContractAddress = await deployerContract.iParser();

    const parserContract = new ethers.Contract(parserContractAddress, allAbis, signer);
    const { constants, bytecode } = await parserContract.parse(rainlangAsBytes);
    const addOrderArgs = {
        validInputs,
        validOutputs,
        evaluableConfig: {
            deployer: deployerContractAddress,
            constants,
            bytecode
        },
        meta: encodeMeta(rainlang),
    };

    // addOrder tx data
    const addOrderData = orderbookContract.interface.encodeFunctionData("addOrder", [addOrderArgs]);

    // deposit amount
    const depositAmount = "10000"; // set desired deposit amount, should follow token decimals
    // deposit tx data
    const depositData = orderbookContract.interface.encodeFunctionData(
        "deposit",
        [
            addOrderArgs.validOutputs[0].token,
            addOrderArgs.validOutputs[0].vaultId,
            depositAmount
        ]
    );

    // approve token spend for orderbook contract
    const erc20Contract = new ethers.Contract(addOrderArgs.validOutputs[0].token, erc20Abi, signer);
    const approveTx  = await erc20Contract.approve(orderbokContractAddress, depositAmount);
    await approveTx.wait(); // wait for approve tx to get mined

    // multicall tx
    const tx = await orderbookContract.multicall([addOrderData, depositData]);
    setTransactionHash(tx.hash);
  }

  return (
    <div style={{paddingBottom: "60px"}}>
        <button style={{ borderRadius: '10px', padding: '20px' }} onClick={deployStrategy}>Deploy DCA Strategy</button>
        <div style={{ marginTop: '20px' }}>
            {transactionHash && (
            <div>
                <a href={`https://flare-explorer.flare.network/tx/${transactionHash}`} target="_blank" rel="noopener noreferrer">View transaction on Blockscout</a>
            </div>
            )}
        </div>
    </div>
  )
}
