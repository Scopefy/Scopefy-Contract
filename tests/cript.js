
const ERRORS = require('../../helpers/errors')
const { soliditySha3 } = require('web3-utils')
const { rawEncode } = require('ethereumjs-abi')
const { getEventArgument, ZERO_ADDRESS } = require('@aragon/contract-helpers-test')
const { assertEvent, assertAmountOfEvents, assertRevert } = require('@aragon/contract-helpers-test/src/asserts')
const { getInstalledApp, createExecutorId, encodeCallScript } = require('@aragon/contract-helpers-test/src/aragon-os')

const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const KernelProxy = artifacts.require('KernelProxy')
const EVMScriptRegistry = artifacts.require('EVMScriptRegistry')
const CallsScript = artifacts.require('CallsScript')
const IEVMScriptExecutor = artifacts.require('IEVMScriptExecutor')

// Mocks
const AppStubScriptRunner = artifacts.require('AppStubScriptRunner')
const ExecutionTarget = artifacts.require('ExecutionTarget')
const EVMScriptExecutorMock = artifacts.require('EVMScriptExecutorMock')
const EVMScriptExecutorNoReturnMock = artifacts.require('EVMScriptExecutorNoReturnMock')
const EVMScriptExecutorRevertMock = artifacts.require('EVMScriptExecutorRevertMock')
const EVMScriptRegistryConstantsMock = artifacts.require('EVMScriptRegistryConstantsMock')

const EMPTY_BYTES = '0x'

contract('EVM Script', ([_, boss, nonContract]) => {
  let kernelBase, aclBase, evmScriptRegBase, dao, acl, evmScriptReg
  let scriptExecutorMock, scriptExecutorNoReturnMock, scriptExecutorRevertMock
  let APP_BASES_NAMESPACE, APP_ADDR_NAMESPACE, APP_MANAGER_ROLE
  let EVMSCRIPT_REGISTRY_APP_ID, REGISTRY_ADD_EXECUTOR_ROLE, REGISTRY_MANAGER_ROLE
  let ERROR_MOCK_REVERT, ERROR_EXECUTION_TARGET

  const SCRIPT_RUNNER_APP_ID = '0x1234'

  before(async () => {
    kernelBase = await Kernel.new(true) // petrify immediately
    aclBase = await ACL.new()
    evmScriptRegBase = await EVMScriptRegistry.new()
    scriptExecutorMock = await EVMScriptExecutorMock.new()
    scriptExecutorNoReturnMock = await EVMScriptExecutorNoReturnMock.new()
    scriptExecutorRevertMock = await EVMScriptExecutorRevertMock.new()
    const evmScriptRegConstants = await EVMScriptRegistryConstantsMock.new()
    const executionTarget = await ExecutionTarget.new()

    APP_BASES_NAMESPACE = await kernelBase.APP_BASES_NAMESPACE()
    APP_ADDR_NAMESPACE = await kernelBase.APP_ADDR_NAMESPACE()
    APP_MANAGER_ROLE = await kernelBase.APP_MANAGER_ROLE()

    EVMSCRIPT_REGISTRY_APP_ID = await evmScriptRegConstants.getEVMScriptRegistryAppId()
    REGISTRY_ADD_EXECUTOR_ROLE = await evmScriptRegBase.REGISTRY_ADD_EXECUTOR_ROLE()
    REGISTRY_MANAGER_ROLE = await evmScriptRegBase.REGISTRY_MANAGER_ROLE()

    ERROR_MOCK_REVERT = await scriptExecutorRevertMock.ERROR_MOCK_REVERT()
    ERROR_EXECUTION_TARGET = await executionTarget.ERROR_EXECUTION_TARGET()
  })

  beforeEach(async () => {
    dao = await Kernel.at((await KernelProxy.new(kernelBase.address)).address)
    await dao.initialize(aclBase.address, boss)
    acl = await ACL.at(await dao.acl())

    // Set up app management permissions
    await acl.createPermission(boss, dao.address, APP_MANAGER_ROLE, boss, { from: boss })

    // Set up script registry (MUST use correct app ID and set as default app)
    const initPayload = evmScriptRegBase.contract.methods.initialize().encodeABI()
    const evmScriptRegReceipt = await dao.newAppInstance(EVMSCRIPT_REGISTRY_APP_ID, evmScriptRegBase.address
