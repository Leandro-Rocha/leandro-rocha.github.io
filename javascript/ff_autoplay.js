'use strict'

function elapsedTime(since, until) {
  var elapsed

  if (until) elapsed = (until - since) / 1000
  else elapsed = (new Date().getTime() - since) / 1000

  if (elapsed >= 0) {
    const diff = {}

    diff.days = Math.floor(elapsed / 86400)
    diff.hours = Math.floor((elapsed / 3600) % 24)
    diff.minutes = Math.floor((elapsed / 60) % 60)
    diff.seconds = Math.floor(elapsed % 60)

    let message = `${diff.days}d ${diff.hours}h ${diff.minutes}m ${diff.seconds}s`
    message = message.replace(/(?:0. )+/, '')
    return message
  } else {
    return '0s'
  }
}

function clickButton(btn) {
  if (btn && !btn.disabled) {
    btn.click()
    return true
  }

  return false
}

/************************************************************************************************************************************************** */
/************************************************************************************************************************************************** */
/************************************************************************************************************************************************** */

var AUTOPLAY_OPTIONS = {
  MIN_INTERVAL: 1000 / 30,
  MISSION_CONTAINER_INTERVAL: 100,
}

var AUTOPLAY_STATS = {
  startTime: 0,
  endTime: 0,
  humanWire: {
    name: 'Wire stats for human stage',
    totalBought: 0,
    minPrice: Number.MAX_VALUE,
    maxPrice: 0,
    totalSpent: 0,
  },
}

var MISSION_STATUS = {
  NOT_STARTED: 'Not Started',
  ONGOING: 'Ongoing',
  ACCOMPLISHED: 'Accomplished',
  ABORTED: 'Aborted',
}

class Autoplay {
  constructor() {
    Autoplay.missionIntervals = []
  }

  static startMissionInterval(mission) {
    if (Autoplay.missionIntervals.indexOf(mission) > 0) throw 'Interval already defined for: ' + this.description

    mission.missionPointer = setInterval(mission.missionLoop, mission.interval)
    Autoplay.missionIntervals.push(mission)

    return mission
  }

  static clearMissionInterval(mission) {
    let index = Autoplay.missionIntervals.indexOf(mission)

    if (index > -1) {
      Autoplay.missionIntervals.splice(index, 1)

      clearInterval(mission.missionPointer)
      mission.missionPointer = undefined
    } else {
      throw 'Mission interval not found: ' + mission.status + ' - ' + mission.description
    }
  }

  start(mission) {
    Autoplay.mission = mission
    AUTOPLAY_STATS.startTime = new Date()
    mission.start()
  }

  end() {
    AUTOPLAY_STATS.endTime = new Date()
    Autoplay.mission.end()
  }

  getMissionIntervals() {
    return Autoplay.missionIntervals
  }
}

class Mission {
  constructor(accomplishedCheck, action, description, interval = 1000) {
    this.accomplishedCheck = accomplishedCheck
    this.action = action
    this.interval = interval > AUTOPLAY_OPTIONS.MIN_INTERVAL ? interval : AUTOPLAY_OPTIONS.MIN_INTERVAL
    this.description = description
    this.status = MISSION_STATUS.NOT_STARTED
    this.type = 'Mission'
    this.params = {}
  }

  isOptional() {
    return this.optional == true
  }

  makeOptional() {
    this.optional = true
  }

  isAccomplished() {
    return this.status == MISSION_STATUS.ACCOMPLISHED || this.accomplishedCheck(this.params)
  }

  isDone() {
    return this.status == MISSION_STATUS.ACCOMPLISHED || this.status == MISSION_STATUS.ABORTED
  }

  setSetup(func) {
    this.setup = func
  }

  start() {
    if (this.status == MISSION_STATUS.ACCOMPLISHED) {
      // Already accomplished. Do nothing
    } else if (this.isAccomplished()) {
      // Accomplished
      this.end()
    } else if (this.status == MISSION_STATUS.NOT_STARTED) {
      if (this.type != 'Container') console.debug('Starting ' + (this.optional ? 'optional ' : '') + this.type + ': ' + this.description)

      this.status = MISSION_STATUS.ONGOING

      this.startTime = new Date()

      this.missionLoop = () => {
        if (this.isAccomplished()) this.end()
        else {
          this.action(this.params)
          if (this.isAccomplished()) this.end()
        }
      }

      Autoplay.startMissionInterval(this)

      if (this.setup) this.setup(this.params)

      // Execute once right away
      this.missionLoop()
    }

    return this
  }

  end() {
    if (this.status == MISSION_STATUS.ONGOING) {
      Autoplay.clearMissionInterval(this)
      if (this.cleanup) this.cleanup()
    }

    if (this.status == MISSION_STATUS.ONGOING || this.status == MISSION_STATUS.NOT_STARTED) {
      this.endTime = new Date()
      let newStatus = this.accomplishedCheck(this.params) ? MISSION_STATUS.ACCOMPLISHED : MISSION_STATUS.ABORTED

      if (this.status == MISSION_STATUS.ONGOING) {
        console.debug(this.type + ' ' + newStatus + ': ' + this.description + ' (' + elapsedTime(this.startTime) + ')')
      }

      this.status = newStatus
    }
  }
}

/**
 *Class to hold a collection of Missions
 */
class MissionContainer extends Mission {
  constructor(missions, action, description, interval) {
    let isAccomplished = () => this.missions.every((m) => m.isOptional() || m.isAccomplished())

    super(isAccomplished, action, description, interval)

    this.type = 'Container'
    this.missions = [].concat(missions)
  }

  end() {
    this.missions.forEach((mission) => mission.end())
    super.end()
  }
}

/**
 * Missions that will be executed in sequence, one at a time
 */
class SequentialExecuter extends MissionContainer {
  constructor(missions, description, interval = 100) {
    let action = () => {
      if (this.currentMission && this.currentMission.isDone()) {
        this.accomplishedMissions.push(this.currentMission)

        this.currentMission = this.notStartedMissions.shift()

        if (this.currentMission) {
          this.currentMission.start()
        }
      }
    }

    super(missions, action, description, interval)

    this.notStartedMissions = missions
    this.accomplishedMissions = []
  }

  start() {
    super.start()
    if (!this.isAccomplished()) {
      this.currentMission = this.notStartedMissions.shift()
      if (this.currentMission) this.currentMission.start()
    }
  }
}

/**
 * Missions that will be executed at the same time
 */
// TODO: rename to parallel
class SimultaneousExecuter extends MissionContainer {
  constructor(missions, description, interval = 100) {
    let action = () => { }

    super(missions, action, description, interval)
  }

  start() {
    super.start()
    if (!this.isAccomplished()) {
      this.missions.forEach((m) => m.start())
    }
  }
}

class MissionFactory {
  constructor(type, description) {
    this.type = type
    this.description = description

    this.mission = undefined
    this.optional = false
    this.runForever = false
    this.goal = undefined
    this.setup = undefined
    this.params = {}
  }

  static createMission(type, description, interval) {
    return new SingleMissionFactory(type, description, interval)
  }

  static createMultipleMission(type, description) {
    return new MultipleMissionFactory(type, description)
  }

  /** This mission will be considered accomplished when the passed parameter returns true */
  setGoal(mission) {
    if (mission instanceof Mission) this.goal = mission.accomplishedCheck
    else this.goal = mission
    return this
  }

  /** Passed function will be executed before starting the mission */
  setSetup(func) {
    this.setup = func
    return this
  }

  setCleanup(func) {
    this.cleanup = func
    return this
  }

  addParam(key, value) {
    this.params[key] = value

    return this
  }

  makeOptional() {
    this.optional = true
    return this
  }

  setRunForever() {
    this.runForever = true
    return this
  }

  create() {
    this.mission.type = this.type
    this.mission.params = this.params

    if (this.optional) this.mission.makeOptional()
    if (this.goal) this.mission.accomplishedCheck = this.goal
    if (this.runForever) this.mission.accomplishedCheck = () => false
    if (this.setup) this.mission.setup = this.setup
    if (this.cleanup) this.mission.cleanup = this.cleanup

    return this.mission
  }
}

class MultipleMissionFactory extends MissionFactory {
  constructor(type, description) {
    super(type, description, AUTOPLAY_OPTIONS.MISSION_CONTAINER_INTERVAL)

    this.simultaneousMissions = []
    this.sequentialMissions = []
    this.optionalMissions = []
  }

  addParallelMission(missions) {
    this.simultaneousMissions = this.simultaneousMissions.concat(missions)
    return this
  }

  addStep(missions) {
    this.sequentialMissions = this.sequentialMissions.concat(missions)
    return this
  }

  addOptionalMission(missions) {
    this.optionalMissions = this.optionalMissions.concat(missions)
    return this
  }

  create() {
    this.optionalMissions.forEach((m) => m.makeOptional())
    let allMissions = []

    if (this.sequentialMissions.length > 0) {
      allMissions.push(new SequentialExecuter(this.sequentialMissions, this.description + ' - Sequential Missions'))
    }

    if (this.simultaneousMissions.length > 0) {
      allMissions = allMissions.concat(this.simultaneousMissions)
    }

    if (this.optionalMissions.length > 0) {
      allMissions = allMissions.concat(this.optionalMissions)
    }

    this.mission = new SimultaneousExecuter(allMissions, this.description, this.interval)

    return super.create()
  }
}

class SingleMissionFactory extends MissionFactory {
  constructor(type, description, interval) {
    super(type, description)

    this.interval = interval
  }

  setAction(func) {
    this.action = func
    return this
  }

  create() {
    if (!this.goal && !this.runForever) throw `You need to set a *goal* or *runForever* for your Mission [${this.description}]`
    if (!this.action) throw `You need to set an action for your Mission [${this.description}]`

    this.mission = new Mission(this.goal, this.action, this.description, this.interval)
    return super.create()
  }
}

//============================================================================================================================================================================
//============================================================================================================================================================================
//============================================================================================================================================================================

function buyPerk(title, interval = 1000) {
  return MissionFactory.createMission('Mission', 'Buy perk: ' + title, interval)
    .addParam('perk', Shop.titleToPerk(title))
    .setAction((params) => {
      if (ResourceManager.materialAvailable('M001') >= params.perk.goldCost) {
        Shop.buyPerk(params.perk.id)
      }
    })
    .setGoal((params) => Shop.alreadyPurchased(params.perk.id))
    .create()
}

function buyRecipe(name, interval = 1000) {
  return MissionFactory.createMission('Mission', 'Buy recipe: ' + name, interval)
    .addParam('recipe', recipeList.nameToItem(name))
    .setAction((params) => {
      const isAvailable = GuildManager.availableRecipeList().some((r) => r.id === params.recipe.id)

      if (isAvailable && canAfford(params.recipe.goldCost)) {
        recipeList.buyRecipe(params.recipe.id)
      }
    })
    .setGoal((params) => recipeList.idToItem(params.recipe.id).owned)
    .create()
}

function craftItem(name, interval = 1000) {
  return MissionFactory.createMission('Mission', 'Craft recipe: ' + name, interval)
    .addParam('recipe', recipeList.nameToItem(name))
    .setAction((params) => {
      if (actionSlotManager.hasFreeSlot() && params.recipe.canProduce) actionSlotManager.addSlot(params.recipe.id)
      else emptyCraftSlots()
    })
    .setGoal((params) => actionSlotManager.slots.some((slot) => slot.itemid === params.recipe.id))
    .create()
}

function equipHero(heroName, itemName, rarity = -1, sharp = -1, interval = 1000) {
  return MissionFactory.createMission('Mission', `Equip ${heroName} with ${itemName}`, interval)
    .addParam('hero', HeroManager.nameToHero(heroName))
    .addParam('item', recipeList.nameToItem(itemName))
    .setAction((params) => {
      const item = Inventory.inv.find((inv) => inv != null && inv.id === params.item.id && (rarity < 0 || inv.rarity === rarity) && (sharp < 0 || inv.sharp === sharp))
      if (item) HeroManager.equipItem(item.containerID, params.hero.id)
    })
    .setGoal((params) => params.hero.gearSlots.some((slot) => slot.gear !== null && slot.gear.id === params.item.id && (rarity < 0 || slot.gear.rarity === rarity) && (sharp < 0 || slot.gear.sharp === sharp)))
    .create()
}

function fulfillOrder(order, interval = 1000) {
  return MissionFactory.createMission('Mission', 'Fulfill: ' + order.displayName, interval)
    .setAction(() => {
      const item = Inventory.findItem(order.id, order.rarity, order.sharp)
      if (item) GuildManager.idToGuild(order.gid).submitItem(order.ap_slot)
    })
    .setGoal(() => order.complete())
    .create()
}

function masterRecipes(interval = 1000) {
  return MissionFactory.createMission('Mission', 'Master Recipes', interval)
    .setAction(masterRecipesAction)
    .setRunForever()
    .create()
}

//============================================================================================================================================================================
//============================================================================================================================================================================
//============================================================================================================================================================================

Hero.prototype.isItemBetter = function (itemContainer) {
  const currentEquippedSlot = this.gearSlots.find((slot) => slot.type === itemContainer.type)
  if (currentEquippedSlot) {
    const gear = currentEquippedSlot.gear
    return gear === null || itemContainer.pow() > gear.pow() || itemContainer.hp() > gear.hp()
    // (gear.id === itemContainer.id && itemContainer.rarity > gear.rarity) || (itemContainer.rarity === gear.rarity && itemContainer.sharp > gear.sharp)

  }

  return false
}

Hero.prototype.equipIfBetter = function (itemContainer) {
  if (this.isItemBetter(itemContainer)) {
    HeroManager.equipItem(itemContainer.containerID, this.id)
  }
}

HeroManager.nameToHero = function (name) {
  return HeroManager.heroes.find((h) => h.name === name)
}

HeroManager.equipIfBetter = function (itemContainer) {
  HeroManager.ownedHeroes().forEach((hero) => hero.equipIfBetter(itemContainer))
}

HeroManager.upgradeFromInventory = function () {
  Inventory.nonblank()
    .forEach((itemContainer) => HeroManager.equipIfBetter(itemContainer))
}

ResourceManager.gold = function () {
  return ResourceManager.materialAvailable('M001')
}

ResourceManager.maxedMaterials = function () {
  return ResourceManager.materials.filter((material) => material.amt == 1000)
}

Inventory.findItem = function inventoryCount(id, rarity = 0, sharp = 0) {
  return Inventory.nonblank().find((r) => r.id === id && r.rarity === rarity && r.sharp === sharp)
}

Inventory.containerIdToIndex = function (containerID) {
  return Inventory.inv.findIndex((container) => container != null && container.containerID == containerID)
}

Item.prototype.canAffordMastery = function () {
  const masteryCost = this.masteryCost()
  return ResourceManager.materialAvailable(masteryCost.id) >= masteryCost.amt
}

Shop.titleToPerk = function (title) {
  return this.perks.find((r) => r.title === title)
}

recipeList.nameToItem = function (name) {
  return this.recipes.find((r) => r.name === name)
}

recipeList.availableToMaster = function () {
  return recipeList.recipes
    .filter((recipe) => recipe.owned && !recipe.mastered && recipe.canAffordMastery())
}

recipeList.availableToMasterForMinimum = function () {
  return recipeList.availableToMaster()
    .filter((recipe) => recipe.minMastery == recipe.masteryCost().amt)
}

recipeList.availableToMasterWithMaxedMaterial = function () {
  return recipeList.availableToMaster()
    .filter((recipe) => ResourceManager.maxedMaterials().find((material) => material.id == recipe.material()))
}

recipeList.sortByMasteryCost = function (a, b) {
  return a.masteryCost().amt - b.masteryCost().amt
}

GuildManager.getAllOrders = function () {
  return (
    GuildManager.guilds
      .filter((guild) => !guild.maxLvlReached())
      .reduce((orders, guild) => {
        guild.order1.ap_slot = 1
        guild.order2.ap_slot = 2
        guild.order3.ap_slot = 3

        orders.push(guild.order1)
        if (guild.lvl > 3) orders.push(guild.order2)
        if (guild.lvl > 7) orders.push(guild.order3)

        return orders
      }, [])
  )
}

GuildManager.getIncompleteOrders = function () {
  return this.getAllOrders().filter((order) => order.left() > 0)
}

GuildManager.getCraftableOrders = function () {
  return this.getIncompleteOrders().filter((order) => order.item.canProduce && order.item.owned && ResourceManager.canAffordMaterial(order.item))
}

GuildManager.availableRecipeList = function () {
  return GuildManager.guilds.filter((g) => g.unlocked()).reduce((recipes, guild) => recipes.concat(...guild.availableRecipeList()), [])
}

actionSlotManager.hasFreeSlot = function () {
  return actionSlotManager.slots.length < actionSlotManager.maxSlots
}

Guild.prototype.availableRecipeList = function () {
  return this.recipeToBuy().filter((r) => r.repReq <= this.lvl)
}

//============================================================================================================================================================================
//============================================================================================================================================================================
//============================================================================================================================================================================

function sellWeakerItemsAction() {
  HeroManager.upgradeFromInventory()
  sellEverythingAction()
}

function countOwned(itemID, rarity = -1, sharp = -1) {
  return inventoryCount(itemID, rarity, sharp) + countFusioning(itemID, rarity, sharp)
}

function inventoryCount(itemID, rarity = -1, sharp = -1) {
  return Inventory.nonblank().filter((r) => r.id === itemID && (rarity < 0 || r.rarity === rarity) && (sharp < 0 || r.sharp === sharp)).length
}

function countFusioning(itemID, rarity = -1, sharp = -1) {
  return FusionManager.slots.filter((fuse) => fuse.id == itemID && (rarity < 0 || fuse.rarity == rarity) && (sharp < 0 || fuse.sharp == sharp) && fuse.started).length
}

function countAllPotential(itemID, rarity = -1, sharp = -1) {
  return countOwned(itemID, rarity, sharp) + (rarity > 0 ? 0 : countCrafting(itemID))
}

function countCrafting(itemID) {
  return actionSlotManager.slots.filter((slot) => slot.itemid == itemID).length
}

function calculateRequiredCraft(itemID, rarity, amount) {
  const stillNeeded = amount - countAllPotential(itemID, rarity)

  if (rarity == 0) {
    return stillNeeded
  }

  if (stillNeeded < 1) {
    return stillNeeded - countAllPotential(itemID, 0)
  }

  return calculateRequiredCraft(itemID, rarity - 1, 3 * stillNeeded)
}

function needCraftMore(itemID, rarity, amount) {
  return calculateRequiredCraft(itemID, rarity, amount) > 0
}

function startCraftsNeededByOrders() {
  const orders = GuildManager.getCraftableOrders().filter((order) => needCraftMore(order.id, order.rarity, order.left()))

  if (orders.length > 0) {
    const order = orders[0]

    // console.log('Still need to craft ' + stillNeeded + ' ' + order.displayName)

    if (actionSlotManager.hasFreeSlot()) {
      actionSlotManager.addSlot(order.id)
    }
  }
}

function startDungeon(dungeonID, heroes = [], floorSkip = true) {
  PartyCreator.heroes = heroes.map(id => HeroManager.nameToHero(id).id)
  DungeonManager.createDungeon(dungeonID, floorSkip)
}

function canAfford(amount) {
  return ResourceManager.materialAvailable('M001') >= amount
}

function emptyCraftSlots() {
  actionSlotManager.slots.forEach((slot, index) => actionSlotManager.removeSlot(index))
}

function sellEverythingAction() {
  Inventory.nonblank()
    .filter((container) => container.type != 'Trinkets')
    .forEach((container) => Inventory.sellInventoryIndex(Inventory.containerIdToIndex(container.containerID)))
}

function craftMostProfitableAction() {
  if (!actionSlotManager.hasFreeSlot()) return

  const recipes = recipeList.recipes
    //
    .filter((r) => r.value > 0 && r.owned && r.canProduce && ResourceManager.canAffordMaterial(r))
    .sort((a, b) => b.value / b.craftTime - a.value / a.craftTime)

  if (recipes.length > 0) {
    actionSlotManager.addSlot(recipes[0].id)
  }
}

function cancellUselessCraftsForMoneyMakingAction() {
  //Removes any slot needing materials
  actionSlotManager.slots.forEach((slot, index) => {
    if (slot.status != slotState.CRAFTING && !ResourceManager.canAffordMaterial(slot.item)) actionSlotManager.removeSlot(index)
  })

  const affordableRecipes = recipeList.recipes
    //
    .filter((r) => r.value > 0 && r.owned && ResourceManager.canAffordMaterial(r))
    .sort((a, b) => b.value / b.craftTime - a.value / a.craftTime)

  if (affordableRecipes.length > 0) {
    const bestAffordable = affordableRecipes[0]
    const uselessSlot = actionSlotManager.slots.findIndex((slot) => slot.itemid !== affordableRecipes[0].id && slot.item.value < bestAffordable.value && slot.craftTime / slot.maxCraft() < 0.2)

    if (uselessSlot >= 0) {
      actionSlotManager.removeSlot(uselessSlot)
    }
  }
}

function masterRecipesAction() {
  const candidate = [...recipeList.availableToMasterForMinimum(), ...recipeList.availableToMasterWithMaxedMaterial()]
    .sort(recipeList.sortByMasteryCost)

  if (candidate.length > 0)
    candidate[0].attemptMastery()
}

var GuildOrdersManager = {
  cancelUselessCrafts() {
    const uselessSlot = actionSlotManager.slots.findIndex((slot) => {
      return !GuildManager.getIncompleteOrders().some((order) => order.id == slot.itemid && calculateRequiredCraft(order.id, order.rarity, order.left()) >= 0)
    })

    if (uselessSlot >= 0) actionSlotManager.removeSlot(uselessSlot)
  },
}

//============================================================================================================================================================================
//============================================================================================================================================================================
//============================================================================================================================================================================

function craftMostProfitable() {
  return MissionFactory.createMission('Mission', 'Craft most profitable recipe')
    .setAction(craftMostProfitableAction)
    .setRunForever()
    .create()
}

function cancelUselessCraftsForMoneyMaking() {
  return MissionFactory.createMission('Mission', 'Cancel useless crafts for money making')
    .setAction(cancellUselessCraftsForMoneyMakingAction)
    .setRunForever()
    .create()
}

function findBetterEquipment() {
  return MissionFactory.createMission('Mission', 'Find better equipment')
    .setAction(HeroManager.upgradeFromInventory)
    .setRunForever()
    .create()
}
function sellWeakerItems() {
  return MissionFactory.createMission('Mission', 'Sell everything')
    .setAction(sellWeakerItemsAction)
    .setRunForever()
    .create()
}

function sellEverything() {
  return MissionFactory.createMission('Mission', 'Sell everything')
    .setAction(sellEverythingAction)
    .setRunForever()
    .create()
}

function makeMoney() {
  return MultipleMissionFactory.createMultipleMission('Mission', 'Make Money')
    .setSetup(emptyCraftSlots)
    .addParallelMission(craftMostProfitable())
    .addParallelMission(cancelUselessCraftsForMoneyMaking())
    .addParallelMission(sellWeakerItems())
    .setRunForever()
    .create()
}

function buyAvailableRecipes() {
  return MissionFactory.createMission('Mission', 'Buy available recipes')
    .setAction(() => {
      GuildManager.availableRecipeList()
        .filter((r) => r.goldCost <= ResourceManager.gold())
        .forEach((r) => recipeList.buyRecipe(r.id))
    })
    .setRunForever()
    .create()
}

function craftOrders() {
  return MissionFactory.createMission('Mission', 'Start crafts needed by guild orders')
    .setAction(startCraftsNeededByOrders)
    .setRunForever()
    .create()
}

function fulfillOrders(interval = 1000) {
  return MissionFactory.createMission('Mission', 'Fulfill all guild orders', interval)
    .setAction(() => {
      GuildManager.getIncompleteOrders().forEach((order) => {
        const item = Inventory.findItem(order.id, order.rarity, order.sharp)
        if (item) {
          HeroManager.equipIfBetter(itemContainer)
          GuildManager.idToGuild(order.gid).submitItem(order.ap_slot)
        }
      })
    })
    .setRunForever()
    .create()
}

function cancelUselessCraftsForGuilds() {
  return MissionFactory.createMission('Mission', 'Cancels useless crafts for guild orders')
    .setAction(GuildOrdersManager.cancelUselessCrafts)
    .setRunForever()
    .create()
}

function craftAndFulfillGuildOrders() {
  return MultipleMissionFactory.createMultipleMission('Mission', 'Craft and fulfill all guilds orders')
    .addParallelMission(craftOrders())
    .addParallelMission(cancelUselessCraftsForGuilds())
    .addParallelMission(fulfillOrders())
    .setRunForever()
    .create()
}

var craftKnife = MissionFactory.createMission('Mission', 'Craft Knife')
  .setSetup(() => actionSlotManager.addSlot('R13001'))
  .setAction(() => { })
  .setGoal(() => recipeList.idToItem('R13001').craftCount > 0)
  .create()

var stepUnlockGroovyGrove = MultipleMissionFactory.createMultipleMission('Step', 'Unlock Groovy Grove')
  .addOptionalMission(makeMoney())
  .addStep(buyPerk('Revere'))
  .addStep(buyPerk('Groovy Grove'))
  .create()

var startGroovyGrove = MissionFactory.createMission('Mission', 'Start Groovy Grove')
  .setAction(() => startDungeon('D101', ['Revere']))
  .setGoal(() => HeroManager.nameToHero('Revere').state === HeroState.inDungeon)
  .create()

var startSpookySpot = MissionFactory.createMission('Mission', 'Start Spooky Spot')
  .setAction(() => startDungeon('D201', ['Beorn']))
  .setGoal(() => HeroManager.nameToHero('Beorn').state === HeroState.inDungeon)
  .create()

var startCreepyCrag = MissionFactory.createMission('Mission', 'Start Creepy Crag')
  .setAction(() => startDungeon('D301', ['Neve']))
  .setGoal(() => HeroManager.nameToHero('Neve').state === HeroState.inDungeon)
  .create()

var startLoathingOak = MissionFactory.createMission('Mission', 'Start Loathing Oak')
  .setSetup(() => DungeonManager.abandonAllDungeons())
  .setAction(() => startDungeon('D401', ['Revere', 'Beorn', 'Neve']))
  .setGoal(() => DungeonManager.dungeonByID('D401').status === DungeonStatus.ADVENTURING)
  .create()

var equipRevereWithKnife = MissionFactory.createMission('Mission', 'Equip Revere with Knife')
  .setAction(() => {
    const knife = Inventory.inv.find((inv) => inv != null && inv.id === 'R13001')
    if (knife) HeroManager.equipItem(knife.containerID, 'H203')
  })
  .setGoal(() => HeroManager.idToHero('H203').gearSlots[0].gear !== null)
  .create()

var equipBeornWithMeagerSword = MultipleMissionFactory.createMultipleMission('Mission', 'Equip Beorn with Meager Sword')
  .addParallelMission(craftItem('Meager Sword'))
  .addParallelMission(equipHero('Beorn', 'Meager Sword'))
  .create()

var buyBeornAndSpookySpot = MultipleMissionFactory.createMultipleMission('Step', 'Buy Beorn and Spooky Spot')
  .addOptionalMission(makeMoney())
  .addStep(buyPerk('Spooky Spot'))
  .addStep(buyPerk('Beorn'))
  .create()

var stepUnlockCatsMeow = MultipleMissionFactory.createMultipleMission('Step', "Unlock Cat's Meow")
  .addOptionalMission(makeMoney())
  .addStep(buyPerk("The Cat's Meow"))
  .create()

var catsMeowToLevel1 = MultipleMissionFactory.createMultipleMission('Step', "Level up Cat's Meow to level 1")
  .addOptionalMission(craftAndFulfillGuildOrders())
  .setGoal(() => GuildManager.idToGuild('G003').lvl >= 1)
  .create()

var buyHatRecipe = MultipleMissionFactory.createMultipleMission('Step', 'Buy Simple Hat recipe')
  .addOptionalMission(makeMoney())
  .addStep(buyRecipe('Simple Hat'))
  .create()

var catsMeowToLevel2 = MultipleMissionFactory.createMultipleMission('Step', "Level up Cat's Meow to level 2")
  .addOptionalMission(craftAndFulfillGuildOrders())
  .setGoal(() => GuildManager.idToGuild('G003').lvl >= 2)
  .create()

var buyAA = MultipleMissionFactory.createMultipleMission('Step', 'Buy Spooky Spot and Aviation Association')
  .addOptionalMission(makeMoney())
  .addStep(buyPerk('Aviation Association'))
  .create()

var buyMeagerSwordRecipe = MultipleMissionFactory.createMultipleMission('Step', 'Buy Meager Sword recipe')
  .addOptionalMission(makeMoney())
  .addStep(buyRecipe('Meager Sword'))
  .create()

var aviationAssociationToLevel2 = MultipleMissionFactory.createMultipleMission('Step', 'Level up Aviation Association to level 2')
  .addOptionalMission(buyAvailableRecipes())
  .addOptionalMission(craftAndFulfillGuildOrders())
  .setGoal(() => GuildManager.idToGuild('G001').lvl >= 2)
  .create()

var stepUnlockGreenGuard = MultipleMissionFactory.createMultipleMission('Step', 'Unlock Green Guard')
  .addOptionalMission(makeMoney())
  .addStep(buyPerk('Green Guard'))
  .create()

var greenGuardToLevel2 = MultipleMissionFactory.createMultipleMission('Step', 'Level up Green Guard to level 2')
  .addOptionalMission(buyAvailableRecipes())
  .addOptionalMission(craftAndFulfillGuildOrders())
  .setGoal(() => GuildManager.idToGuild('G002').lvl >= 2)
  .create()

var unlockSecondSlotCreepyCragAndNeve = MultipleMissionFactory.createMultipleMission('Step', 'Unlock Second Slot, Creepy Crag and Neve')
  .addOptionalMission(makeMoney())
  .addStep(buyPerk('Second Slot'))
  .addStep(buyPerk('Creepy Crag'))
  .addStep(buyPerk('Neve'))
  .create()

var unlockAutoSell = MultipleMissionFactory.createMultipleMission('Step', 'Unlock Auto Sell')
  .addOptionalMission(makeMoney())
  .addStep(buyPerk('Auto Sell'))
  .create()

var unlockTrawledTreasures = MultipleMissionFactory.createMultipleMission('Step', 'Unlock Trawled Treasures')
  .addOptionalMission(makeMoney())
  .addStep(buyPerk('Trawled Treasures'))
  .create()

var guildsToLevel4 = MultipleMissionFactory.createMultipleMission('Step', 'Level up all guilds to level 4')
  .addOptionalMission(buyAvailableRecipes())
  .addOptionalMission(craftAndFulfillGuildOrders())
  .setGoal(() =>
    GuildManager.idToGuild('G001').lvl >= 4
    && GuildManager.idToGuild('G002').lvl >= 4
    && GuildManager.idToGuild('G003').lvl >= 4
    && GuildManager.idToGuild('G004').lvl >= 4)
  .create()

var unlockBossBattles = MultipleMissionFactory.createMultipleMission('Step', 'Unlock Boss Battles')
  .addOptionalMission(makeMoney())
  .addStep(buyPerk('Boss Battle'))
  .create()

var stepTutorial = MultipleMissionFactory.createMultipleMission('Campaign', 'Tutorial')
  .addOptionalMission(findBetterEquipment())
  .addOptionalMission(masterRecipes())
  .addStep(craftKnife)
  .addStep(stepUnlockGroovyGrove)
  .addStep(startGroovyGrove)
  .addStep(equipRevereWithKnife)
  .addStep(stepUnlockCatsMeow)
  .addStep(catsMeowToLevel1)
  .addStep(buyHatRecipe)
  .addStep(catsMeowToLevel2)
  .addStep(buyBeornAndSpookySpot)
  .addStep(startSpookySpot)
  .addStep(buyAA)
  .addStep(buyMeagerSwordRecipe)
  .addStep(aviationAssociationToLevel2)
  .addStep(equipBeornWithMeagerSword)
  .addStep(stepUnlockGreenGuard)
  .addStep(greenGuardToLevel2)
  .addStep(unlockSecondSlotCreepyCragAndNeve)
  .addStep(startCreepyCrag)
  .addStep(unlockAutoSell)
  .addStep(unlockTrawledTreasures)
  .addStep(guildsToLevel4)
  .addStep(unlockBossBattles)
  .addStep(startLoathingOak)
  .create()

var ap = new Autoplay()
console.log(123)

ap.start(stepTutorial)

function levelUpGuilds() {
  return MultipleMissionFactory.createMultipleMission('Step', 'Level up guilds')

    .addOptionalMission(buyAvailableRecipes())
    .addOptionalMission(craftAndFulfillGuildOrders())
    .setRunForever()
    .create()
}
