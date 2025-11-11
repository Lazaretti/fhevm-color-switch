import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHEColorSwitch = await deploy("FHEColorSwitch", {
    from: deployer,
    log: true,
  });

  console.log(`FHEColorSwitch contract: `, deployedFHEColorSwitch.address);
};
export default func;
func.id = "deploy_FHEColorSwitch"; // id required to prevent reexecution
func.tags = ["FHEColorSwitch"];
