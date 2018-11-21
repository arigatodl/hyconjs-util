import * as Base58 from "base-58"
import * as blake2b from "blake2b"
import * as crypto from "crypto"
import Long = require("long")
import * as secp256k1 from "secp256k1"
import * as proto from "./serialization/proto"

export function blake2bHash(ob: Uint8Array | string): Uint8Array {
    typeof ob === "string" ? ob = Buffer.from(ob) : ob = ob
    return blake2b(32).update(ob).digest()
}

export function publicKeyToAddress(publicKey: Uint8Array): Uint8Array {
    const hash: Uint8Array = blake2bHash(publicKey)
    const address = new Uint8Array(20)
    for (let i = 12; i < 32; i++) {
        address[i - 12] = hash[i]
    }
    return address
}

export function addressToString(publicKey: Uint8Array): string {
    return "H" + Base58.encode(publicKey) + addressCheckSum(publicKey)
}

export function addressToUint8Array(address: string) {
    if (address.charAt(0) !== "H") {
        throw new Error(`Address is invalid. Expected address to start with 'H'`)
    }
    const check = address.slice(-4)
    address = address.slice(1, -4)
    const out: Uint8Array = Base58.decode(address)
    if (out.length !== 20) {
        throw new Error("Address must be 20 bytes long")
    }
    const expectedChecksum = addressCheckSum(out)
    if (expectedChecksum !== check) {
        throw new Error(`Address hash invalid checksum '${check}' expected '${expectedChecksum}'`)
    }
    return out
}

export function addressCheckSum(arr: Uint8Array): string {
    const hash = blake2bHash(arr)
    let str = Base58.encode(hash)
    str = str.slice(0, 4)
    return str
}

export function zeroPad(input: string, length: number) {
    return (Array(length + 1).join("0") + input).slice(-length)
}

export function hycontoString(val: Long): string {
    const int = val.divide(1000000000)
    const sub = val.modulo(1000000000)
    if (sub.isZero()) {
        return int.toString()
    }

    let decimals = sub.toString()
    while (decimals.length < 9) {
        decimals = "0" + decimals
    }

    while (decimals.charAt(decimals.length - 1) === "0") {
        decimals = decimals.substr(0, decimals.length - 1)
    }

    return int.toString() + "." + decimals
}

export function hyconfromString(val: string): Long {
    if (val === "" || val === undefined || val === null) { return Long.fromNumber(0, true) }
    if (val[val.length - 1] === ".") { val += "0" }
    const arr = val.toString().split(".")
    let hycon = Long.fromString(arr[0], true).multiply(Math.pow(10, 9))
    if (arr.length > 1) {
        arr[1] = arr[1].length > 9 ? arr[1].slice(0, 9) : arr[1]
        const subCon = Long.fromString(arr[1], true).multiply(Math.pow(10, 9 - arr[1].length))
        hycon = hycon.add(subCon)
    }
    return hycon.toUnsigned()
}

export function encodingMnemonic(str: string): string {
    return str.normalize("NFKD")
}

export function encrypt(password: string, data: string): { iv: string, encryptedData: string } {
    const key = Buffer.from(blake2bHash(password))
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
    const encryptedData = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()])
    return { iv: iv.toString("hex"), encryptedData: encryptedData.toString("hex") }
}

export function decrypt(password: string, iv: string, data: string): Buffer | boolean {
    try {
        const key = Buffer.from(blake2bHash(password))
        const ivBuffer = Buffer.from(iv, "hex")
        const dataBuffer = Buffer.from(data, "hex")
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, ivBuffer)
        const originalData = Buffer.concat([decipher.update(dataBuffer), decipher.final()])
        return originalData
    } catch (error) {
        return false
    }
}

export function signTx(fromAddress: string, toAddress: string, amount: string, minerFee: string, nonce: number, privateKey: string): {signature: string, recovery: number} {
    try {
        const from = addressToUint8Array(fromAddress)
        const to = addressToUint8Array(toAddress)

        const iTx: proto.ITx = {
            amount: hyconfromString(amount),
            fee: hyconfromString(minerFee),
            from,
            nonce,
            to,
        }

        let signature: string = ""
        let recovery: number = -1
        if (Date.now() <= 1544108400000) {
            const protoTx = proto.Tx.encode(iTx).finish()
            const txHash = blake2bHash(protoTx)
            const oldSignature = secp256k1.sign(Buffer.from(txHash), Buffer.from(privateKey, "hex"))

            signature = oldSignature.signature.toString("hex")
            recovery = oldSignature.recovery
        } else {
            const iTxNew = Object.assign({ networkid: "hycon" }, iTx)
            const protoTxNew = proto.Tx.encode(iTxNew).finish()
            const txHashNew = blake2bHash(protoTxNew)
            const newSignature = secp256k1.sign(Buffer.from(txHashNew), Buffer.from(privateKey, "hex"))

            signature = newSignature.signature.toString("hex")
            recovery =  newSignature.recovery
        }

        return {signature, recovery}
    } catch (error) {

    }
}
