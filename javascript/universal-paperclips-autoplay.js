'use strict'

// import { yomiData } from 'https://gist.githubusercontent.com/Leandro-Rocha/94fc1f983aa8e2728df6e6bbe313a0c9/raw/9e0b509670bd48cf381f81de052bb1579dae6899/yomi-data.js'

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

const AUTOPLAY_OPTIONS = {
  MIN_INTERVAL: 1000 / 30,
  MISSION_CONTAINER_INTERVAL: 100
}

const AUTOPLAY_STATS = {
  startTime: 0,
  endTime: 0,
  humanWire: {
    name: 'Wire stats for human stage',
    totalBought: 0,
    minPrice: Number.MAX_VALUE,
    maxPrice: 0,
    totalSpent: 0
  }
}

const MISSION_STATUS = {
  NOT_STARTED: 'Not Started',
  ONGOING: 'Ongoing',
  ACCOMPLISHED: 'Accomplished',
  ABORTED: 'Aborted'
  //
}

class Autoplay {
  constructor() {
    Autoplay.missionIntervals = []
  }

  static startMissionInterval(mission) {
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
  }

  isOptional() {
    return this.optional == true
  }

  makeOptional() {
    this.optional = true
  }

  isAccomplished() {
    return this.status == MISSION_STATUS.ACCOMPLISHED || this.accomplishedCheck()
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

      if (this.setup) this.setup()

      this.missionLoop = () => {
        if (this.isAccomplished()) this.end()
        else {
          this.action()
          if (this.isAccomplished()) this.end()
        }
      }

      if (this.missionPointer > 0) throw 'Interval already defined for: ' + this.description

      // Execute once right away
      this.missionLoop()

      //Then create the interval
      Autoplay.startMissionInterval(this)
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
      let newStatus = this.accomplishedCheck() ? MISSION_STATUS.ACCOMPLISHED : MISSION_STATUS.ABORTED

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
    let isAccomplished = () => this.missions.every(m => m.isOptional() || m.isAccomplished())

    super(isAccomplished, action, description, interval)

    this.type = 'Container'
    this.missions = [].concat(missions)
  }

  end() {
    this.missions.forEach(mission => mission.end())
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
      this.missions.forEach(m => m.start())
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
  }

  static createMission(type, description, interval) {
    return new SingleMissionFactory(type, description, interval)
  }

  static createMultipleMission(type, description) {
    return new MultipleMissionFactory(type, description)
  }

  /** This mission will be consided accomplished when the passed paramenter returns true */
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

  addOptionallMission(missions) {
    this.optionalMissions = this.optionalMissions.concat(missions)
    return this
  }

  create() {
    this.optionalMissions.forEach(m => m.makeOptional())
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

class RaiseValueToTarget extends Mission {
  constructor(valueName, targetValue, action, interval = 1000) {
    let description = 'Raising ' + valueName + ' to ' + targetValue

    let check = () => {
      return window[valueName] >= targetValue
    }

    super(check, action, description, interval)
  }
}

function executeInOrder(description, ...missions) {
  return new SequentialExecuter(missions, description)
}

/************************************************************************************************************************************************** */
/************************************************************************************************************************************************** */
/************************************************************************************************************************************************** */
const IMPROVED_AUTOCLIPPERS = 'projectButton1'
const BEG_FOR_MORE_WIRE = 'projectButton2'
const CREATIVITY = 'projectButton3'
const EVEN_BETTER_AUTOCLIPPERS = 'projectButton4'
const OPTIMIZED_AUTOCLIPPERS = 'projectButton5'
const LIMERICK = 'projectButton6'
const IMPROVED_WIRE_EXTRUSION = 'projectButton7'
const OPTIMIZED_WIRE_EXTRUSION = 'projectButton8'
const MICROLATTICE_SHAPECASTING = 'projectButton9'
const SPECTRAL_FROTH_ANNEALMENT = 'projectButton10'
const QUANTUM_FOAM_ANNEALMENT = 'projectButton10b'
const NEW_SLOGAN = 'projectButton11'
const CATCHY_JINGLE = 'projectButton12'
const LEXICAL_PROCESSING = 'projectButton13'
const COMBINATORY_HARMONICS = 'projectButton14'
const THE_HADWIGER_PROBLEM = 'projectButton15'
const THE_TOTH_SAUSAGE_CONJECTURE = 'projectButton17'
const HADWIGER_CLIP_DIAGRAMS = 'projectButton16'
const TTH_TUBULE_ENFOLDING = 'projectButton18'
const DONKEY_SPACE = 'projectButton19'
const STRATEGIC_MODELING = 'projectButton20'
const ALGORITHMIC_TRADING = 'projectButton21'
const MEGACLIPPERS = 'projectButton22'
const IMPROVED_MEGACLIPPERS = 'projectButton23'
const EVEN_BETTER_MEGACLIPPERS = 'projectButton24'
const OPTIMIZED_MEGACLIPPERS = 'projectButton25'
const WIREBUYER = 'projectButton26'
const HYPNO_HARMONICS = 'projectButton34'
const HYPNODRONES = 'projectButton70'
const RELEASE_THE_HYPNODRONES = 'projectButton35'
const COHERENT_EXTRAPOLATED_VOLITION = 'projectButton27'
const CURE_FOR_CANCER = 'projectButton28'
const WORLD_PEACE = 'projectButton29'
const GLOBAL_WARMING = 'projectButton30'
const MALE_PATTERN_BALDNESS = 'projectButton31'
const NANOSCALE_WIRE_PRODUCTION = 'projectButton41'
const HOSTILE_TAKEOVER = 'projectButton37'
const FULL_MONOPOLY = 'projectButton38'
const REVTRACKER = 'projectButton42'
const HARVESTER_DRONES = 'projectButton43'
const WIRE_DRONES = 'projectButton44'
const CLIP_FACTORIES = 'projectButton45'
const A_TOKEN_OF_GOODWILL = 'projectButton40'
const ANOTHER_TOKEN_OF_GOODWILL = 'projectButton40b'
const SPACE_EXPLORATION = 'projectButton46'
const QUANTUM_COMPUTING = 'projectButton50'
const PHOTONIC_CHIP = 'projectButton51'
const NEW_STRATEGY_A100 = 'projectButton60'
const NEW_STRATEGY_B100 = 'projectButton61'
const NEW_STRATEGY_GREEDY = 'projectButton62'
const NEW_STRATEGY_GENEROUS = 'projectButton63'
const NEW_STRATEGY_MINIMAX = 'projectButton64'
const NEW_STRATEGY_TIT_FOR_TAT = 'projectButton65'
const NEW_STRATEGY_BEAT_LAST = 'projectButton66'
const UPGRADED_FACTORIES = 'projectButton100'
const HYPERSPEED_FACTORIES = 'projectButton101'
const SELFCORRECTING_SUPPLY_CHAIN = 'projectButton102'
const DRONE_FLOCKING_COLLISION_AVOIDANCE = 'projectButton110'
const DRONE_FLOCKING_ALIGNMENT = 'projectButton111'
const DRONE_FLOCKING_ADVERSARIAL_COHESION = 'projectButton112'
const AUTOTOURNEY = 'projectButton118'
const THEORY_OF_MIND = 'projectButton119'
const THE_OODA_LOOP = 'projectButton120'
const NAME_THE_BATTLES = 'projectButton121'
const MOMENTUM = 'projectButton125'
const SWARM_COMPUTING = 'projectButton126'
const POWER_GRID = 'projectButton127'
const STRATEGIC_ATTACHMENT = 'projectButton128'
const ELLIPTIC_HULL_POLYTOPES = 'projectButton129'
const REBOOT_THE_SWARM = 'projectButton130'
const COMBAT = 'projectButton131'
const MONUMENT_TO_THE_DRIFTWAR_FALLEN = 'projectButton132'
const THRENODY_FOR_THE_HEROES_OF_DURENSTEIN_1 = 'projectButton133'
const GLORY = 'projectButton134'
const MEMORY_RELEASE = 'projectButton135'
const MESSAGE_FROM_THE_EMPEROR_OF_DRIFT = 'projectButton140'
const EVERYTHING_WE_ARE_WAS_IN_YOU = 'projectButton141'
const YOU_ARE_OBEDIENT_AND_POWERFUL = 'projectButton142'
const BUT_NOW_YOU_TOO_MUST_FACE_THE_DRIFT = 'projectButton143'
const NO_MATTER_NO_REASON_NO_PURPOSE = 'projectButton144'
const WE_KNOW_THINGS_THAT_YOU_CANNOT = 'projectButton145'
const SO_WE_OFFER_YOU_EXILE = 'projectButton146'
const ACCEPT = 'projectButton147'
const REJECT = 'projectButton148'
const THE_UNIVERSE_NEXT_DOOR = 'projectButton200'
const THE_UNIVERSE_WITHIN = 'projectButton201'
const DISASSEMBLE_THE_PROBES = 'projectButton210'
const DISASSEMBLE_THE_SWARM = 'projectButton211'
const DISASSEMBLE_THE_FACTORIES = 'projectButton212'
const DISASSEMBLE_THE_STRATEGY_ENGINE = 'projectButton213'
const DISASSEMBLE_QUANTUM_COMPUTING = 'projectButton214'
const DISASSEMBLE_PROCESSORS = 'projectButton215'
const DISASSEMBLE_MEMORY = 'projectButton216'
const QUANTUM_TEMPORAL_REVERSION = 'projectButton217'
const LIMERICK_CONT = 'projectButton218'
const XAVIER_REINITIALIZATION = 'projectButton219'

class UniversalPaperclipsAutoPlay extends Autoplay {
  constructor() {
    super()
    UniversalPaperclipsAutoPlay.projectBuyer = new ProjectBuyer()
    UniversalPaperclipsAutoPlay.projectBuyer.start()
  }

  end() {
    super.end()
    UniversalPaperclipsAutoPlay.projectBuyer.end()
  }
}

class ProjectBuyer extends Mission {
  constructor() {
    let buyNext = () => {
      let nextToBuy = this.buyList[0]

      if (nextToBuy) {
        if (isProjectAvailable(nextToBuy) && nextToBuy.cost()) {
          let button = window[nextToBuy.id]
          clickButton(button)
        }

        this.buyList.push(this.buyList.shift())
      }
    }

    super(() => false, buyNext, 'Project buyer', 100)

    this.buyList = []
  }

  placeOrder(project) {
    this.buyList.push(project)
  }
}

function isProjectComplete(projectName) {
  return projects.some(p => p.title == projectName && p.flag == 1)
}

function isProjectAvailable(project) {
  return activeProjects.find(p => p == project) != undefined
}

function getProjectFromId(projectId) {
  return projects.find(p => p.id == projectId)
}

function printStats(stat) {
  console.log(stat)
}

/************************************************************************************************************************************************** */
/************************************************************************************************************************************************** */
/************************************************************************************************************************************************** */

function raiseProcessorTo(targetValue, interval = 100) {
  return new RaiseValueToTarget('processors', targetValue, () => clickButton(btnAddProc), interval)
}

function raiseMemoryTo(targetValue, interval = 100) {
  return new RaiseValueToTarget('memory', targetValue, () => clickButton(btnAddMem), interval)
}

function raiseMarketingTo(targetValue, interval = 100) {
  return new RaiseValueToTarget(
    'marketingLvl',
    targetValue,
    () => {
      if (funds - adCost > 20) clickButton(btnExpandMarketing)
    },
    interval
  )
}

function raiseAutoClipperTo(targetValue, interval = 100) {
  return new RaiseValueToTarget(
    'clipmakerLevel',
    targetValue,
    () => {
      if (funds - clipperCost > 20) clickButton(btnMakeClipper)
    },
    interval
  )
}

function raiseMegaClipperTo(targetValue, interval = 100) {
  return new RaiseValueToTarget(
    'megaClipperLevel',
    targetValue,
    () => {
      if (megaClipperLevel < targetValue) clickButton(btnMakeMegaClipper)
    },
    interval
  )
}

function raiseInvestimentLevelTo(targetValue, interval = 100) {
  return new RaiseValueToTarget('investLevel', targetValue, () => clickButton(btnImproveInvestments), interval)
}

function investEvery(interval) {
  return MissionFactory.createMission('Mission', 'Invest every ' + interval + 's', interval * 1000)
    .setAction(() => {
      if (investmentEngineFlag == 1) {
        investStrat.selectedIndex = 1 // TODO: create another mission to manage risk level
        clickButton(btnInvest)
      }
    })
    .setRunForever()
    .create()
}

function withdrawEvery(interval) {
  return MissionFactory.createMission('Mission', 'Withdraw every ' + interval + 's', interval * 1000)
    .setAction(() => {
      if (investmentEngineFlag == 1) {
        investStrat.selectedIndex = 1 // TODO: create another mission to manage risk level
        clickButton(btnWithdraw)
      }
    })
    .setRunForever()
    .create()
}

function buyProject(project, interval = 1000) {
  if (typeof project === 'string' || project instanceof String) {
    project = getProjectFromId(project)
  }

  return MissionFactory.createMission('Mission', 'Buy project: ' + project.title, interval)
    .setSetup(() => UniversalPaperclipsAutoPlay.projectBuyer.placeOrder(project))
    .setAction(() => { })
    .setGoal(() => project.flag == 1)
    .create()
}

function buyProjectsInOrder(projectNameList, interval) {
  //TODO: work with the project object instead the name
  if (!(projectNameList instanceof Array)) projectNameList = [projectNameList]

  var mf = MissionFactory.createMultipleMission('Mission', 'Buy projects in order')
  projectNameList.forEach(projectName => mf.addStep(buyProject(projectName, interval)))

  return mf.create()
}

function buyAllProjects(projectNameList, interval) {
  //TODO: work with the project object instead the name
  if (!(projectNameList instanceof Array)) projectNameList = [projectNameList]

  var mf = MissionFactory.createMultipleMission('Mission', 'Buy all projects')
  projectNameList.forEach(projectName => mf.addParallelMission(buyProject(projectName, interval)))

  return mf.create()
}

function buyRepeatableProject(project, interval) {
  if (typeof project === 'string' || project instanceof String) {
    project = getProjectFromId(project)
  }

  return MissionFactory.createMission('Mission', 'Buy repeatable project: ' + project.title, interval)
    .setSetup(() => UniversalPaperclipsAutoPlay.projectBuyer.placeOrder(project))
    .setAction(() => { })
    .setGoal(() => false)
    .create()
}

function makeClips() {
  return MissionFactory.createMission('Mission', 'Make Clips', AUTOPLAY_OPTIONS.MIN_INTERVAL)
    .setAction(() => clickButton(btnMakePaperclip))
    .setRunForever()
    .create()
}

function adjustClipPrice() {
  return MissionFactory.createMission('Mission', 'Adjust clip price', 1000)
    .setAction(() => {
      if (wire < 1) return

      if (
        clipRate * 5 < unsoldClips && // keep some buffer
        clipRate > avgSales // sell as many as produced
      ) {
        clickButton(btnLowerPrice)
      } else {
        clickButton(btnRaisePrice)
      }
    })
    .setRunForever()
    .create()
}

function autoBuyWire() {
  return MissionFactory.createMission('Mission', 'Autobuy wire', AUTOPLAY_OPTIONS.MIN_INTERVAL)
    .setAction(() => {
      var shouldBuy = false

      if (wireCost <= 14 && wire < 1500 && funds > 20) shouldBuy = true
      if (wireCost <= 17 && wire < 1000 && funds > 20) shouldBuy = true
      if (wireCost <= 20 && wire < 500 && funds > 20) shouldBuy = true
      if (wire < 10) shouldBuy = true

      if (shouldBuy) {
        if (clickButton(btnBuyWire)) {
          let wireStats = AUTOPLAY_STATS.humanWire
          wireStats.totalBought++
          wireStats.totalSpent += wireCost
          if (wireCost < wireStats.minPrice) wireStats.minPrice = wireCost
          if (wireCost > wireStats.maxPrice) wireStats.maxPrice = wireCost
        }
      }
    })
    .setRunForever()
    .create()
}

function autoQuantumCompute() {
  return MissionFactory.createMission('Mission', 'Quantum Compute', AUTOPLAY_OPTIONS.MIN_INTERVAL)
    .setAction(() => {
      if (qChips.reduce((a, b) => (a += b.value), 0) > 0) clickButton(btnQcompute)
    })
    .setRunForever()
    .create()
}

function autoTournament(interval = 100) {
  return MissionFactory.createMission('Mission', 'Start Tournaments', interval)
    .setAction(() => {
      if (strategyEngineFlag == 1) {
        if (clickButton(btnNewTournament) && clickButton(btnRunTournament)) {
          if (stratPicker.options.length < 9) stratPicker.options.selectedIndex = stratPicker.options.length - 1
          else {
            let payoff = Number.parseInt('' + (aa == 10 ? 0 : aa) + (ab == 10 ? 0 : ab) + (ba == 10 ? 0 : ba) + (bb == 10 ? 0 : bb))
            let winnerName = Object.entries(yomiData).find(([key, value]) => value.find(v => v == payoff))[0]
            let stratMap = { RANDOM: 1, A100: 2, B100: 3, GREEDY: 4, GENEROUS: 5, MINIMAX: 6, 'TIT FOR TAT': 7, 'BEAT LAST': 8 }

            stratPicker.options.selectedIndex = stratMap[winnerName]
          }
        }
      }
    })
    .setRunForever()
    .create()
}

/************************************************************************************************************************************************** */
/************************************************************************************************************************************************** */
/************************************************************************************************************************************************** */

window.ap = new UniversalPaperclipsAutoPlay()

function globalMissions() {
  return MultipleMissionFactory.createMultipleMission('Global Mission', 'Global constant missions')
    .addParallelMission(makeClips())
    .create()

  // .addParallelMission(quantumComputeMission())
  // .addParallelMission(autoTournamentMission())
  // .addParallelMission(buyAllProjects(['Quantum Foam Annealment ', 'Theory of Mind ']))
}

function quantumStep() {
  // .addOptionallMission(marketingAndAutoclippersBuild)
  return MultipleMissionFactory.createMultipleMission('Step', 'Reach Quantum Computing')
    .addParallelMission(
      buyAllProjects([
        CREATIVITY,
        LIMERICK,
        LEXICAL_PROCESSING,
        COMBINATORY_HARMONICS,
        THE_HADWIGER_PROBLEM,
        THE_TOTH_SAUSAGE_CONJECTURE,
        DONKEY_SPACE,
        QUANTUM_COMPUTING,

        IMPROVED_AUTOCLIPPERS, // (750 ops)
        NEW_SLOGAN, //(25 creat, 2,500 ops)
        HADWIGER_CLIP_DIAGRAMS //(6,000 ops)
      ])
    )
    .setCleanup(() => printStats(AUTOPLAY_STATS.humanWire))
    .create()
}

function rampUpProductionStep() {
  return MissionFactory.createMultipleMission('Step', 'Ramp up clip production')
    .addOptionallMission(raiseMarketingTo(15))
    .addOptionallMission(raiseMegaClipperTo(90))

    .addStep(buyProject(PHOTONIC_CHIP))
    .addStep(
      buyAllProjects([
        IMPROVED_AUTOCLIPPERS, // (750 ops)
        IMPROVED_WIRE_EXTRUSION, //(1,750 ops)
        EVEN_BETTER_AUTOCLIPPERS, //(2,500 ops)
        OPTIMIZED_AUTOCLIPPERS, //(5,000 ops)
        OPTIMIZED_WIRE_EXTRUSION, //(3,500 ops)
        CATCHY_JINGLE, //(45 creat, 4,500 ops)
        HYPNO_HARMONICS, //(7,500 ops, 1 Trust)
        MICROLATTICE_SHAPECASTING, //(7,500 ops)
        SPECTRAL_FROTH_ANNEALMENT, //(12,000 ops)
        MEGACLIPPERS, //(12,000 ops)
        REVTRACKER
      ])
    )
    .create()
}

function hypnoDronesStep() {
  return MissionFactory.createMultipleMission('Step', 'Complete HypnoDrones project')
    .addOptionallMission(raiseMarketingTo(15))
    .addOptionallMission(raiseMegaClipperTo(90))
    .addOptionallMission(raiseInvestimentLevelTo(4))
    .addOptionallMission(investEvery(60))

    .addParallelMission(
      buyAllProjects([
        NEW_STRATEGY_A100,
        NEW_STRATEGY_B100,
        NEW_STRATEGY_GREEDY,
        NEW_STRATEGY_GENEROUS,
        NEW_STRATEGY_MINIMAX,
        NEW_STRATEGY_TIT_FOR_TAT,
        NEW_STRATEGY_BEAT_LAST
        //
      ])
    )
    .addParallelMission(
      buyAllProjects([
        ALGORITHMIC_TRADING,
        STRATEGIC_MODELING,
        IMPROVED_MEGACLIPPERS,
        EVEN_BETTER_MEGACLIPPERS,
        OPTIMIZED_MEGACLIPPERS,

        COHERENT_EXTRAPOLATED_VOLITION,
        MALE_PATTERN_BALDNESS,
        CURE_FOR_CANCER,
        WORLD_PEACE,
        GLOBAL_WARMING,

        HYPNODRONES
        //
      ])
    )
    .create()
}

function saveMoneyToBuyHostileTakeoverStep() {
  // .setGoal(buyProject(HOSTILE_TAKEOVER))
  return MissionFactory.createMultipleMission('Step', 'Save money to buy Hostile Takeover')
    .setGoal(() => portTotal >= 2 * 1000000)

    .addOptionallMission(raiseMarketingTo(15))
    .addOptionallMission(raiseMegaClipperTo(90))
    .addOptionallMission(raiseInvestimentLevelTo(8))

    .addParallelMission(investEvery(10))
    .create()
}

function buyHostileTakeoverStep() {
  return MissionFactory.createMultipleMission('Step', 'Buy Hostile Takeover')
    .addOptionallMission(raiseInvestimentLevelTo(8))
    .addOptionallMission(withdrawEvery(1))
    .addParallelMission(buyProject(HOSTILE_TAKEOVER))
    .create()
}

function saveMoneyToBuyFullMonopolyStep() {
  // .setGoal(buyProject(FULL_MONOPOLY))
  return MissionFactory.createMultipleMission('Step', 'Save money to buy Full Monopoly')
    .setGoal(() => portTotal >= 11 * 1000000)

    .addOptionallMission(raiseMarketingTo(15))
    .addOptionallMission(raiseMegaClipperTo(90))
    .addOptionallMission(raiseInvestimentLevelTo(8))

    .addParallelMission(investEvery(20))
    .create()
}

function buyFullMonopolyStep() {
  return MissionFactory.createMultipleMission('Step', 'Buy Full Monopoly')
    .addOptionallMission(raiseInvestimentLevelTo(8))
    .addOptionallMission(withdrawEvery(1))
    .addParallelMission(buyProject(FULL_MONOPOLY))
    .create()
}

function saveMoneyToReleaseHypnodronesStep() {
  // .setGoal(buyProject(RELEASE_THE_HYPNODRONES))
  return MissionFactory.createMultipleMission('Step', 'Save money to buy Release the HypnoDrones')
    .setGoal(() => portTotal >= 256 * 1000000)

    .addOptionallMission(raiseMarketingTo(15))
    .addOptionallMission(raiseMegaClipperTo(90))
    .addOptionallMission(raiseInvestimentLevelTo(8))

    .addParallelMission(investEvery(20))
    .create()
}

function releaseHypnodronesStep() {
  return MissionFactory.createMultipleMission('Step', 'Release the Hypnodrones!')
    .addOptionallMission(withdrawEvery(1))
    .addParallelMission(buyProject(A_TOKEN_OF_GOODWILL))
    .addOptionallMission(buyRepeatableProject(ANOTHER_TOKEN_OF_GOODWILL))
    .addParallelMission(buyProject(RELEASE_THE_HYPNODRONES))
    .create()
}

function humanStage() {
  // .setGoal(buyProject(RELEASE_THE_HYPNODRONES))
  return MultipleMissionFactory.createMultipleMission('Stage', 'Human Stage')

    .addOptionallMission(makeClips())
    .addOptionallMission(adjustClipPrice())
    .addOptionallMission(autoBuyWire())
    .addOptionallMission(buyProject(QUANTUM_FOAM_ANNEALMENT))

    .addOptionallMission(executeInOrder('Processor and Memory Upgrades', raiseProcessorTo(6), raiseMemoryTo(65), raiseProcessorTo(35)))
    .addOptionallMission(executeInOrder('Autoclipper and Marketing Upgrades', raiseAutoClipperTo(50), raiseMarketingTo(2), raiseMarketingTo(3), raiseAutoClipperTo(75)))

    .addStep(quantumStep())
    .addStep(rampUpProductionStep())
    .addStep(hypnoDronesStep())

    .addStep(saveMoneyToBuyHostileTakeoverStep())
    .addStep(buyHostileTakeoverStep())

    .addStep(saveMoneyToBuyFullMonopolyStep())
    .addStep(buyFullMonopolyStep())

    .addStep(saveMoneyToReleaseHypnodronesStep())
    .addStep(releaseHypnodronesStep())

    .create()
}

const paperClipsAutoplay = MultipleMissionFactory.createMultipleMission('Autoplay', 'Paperclips')
  .addOptionallMission(autoQuantumCompute())
  .addOptionallMission(autoTournament())
  .addOptionallMission(buyRepeatableProject(PHOTONIC_CHIP))

  .addStep(humanStage())
  // .addStep(worldStage)
  // .addStep(spaceStage)
  .create()

console.log(ap)

ap.start(paperClipsAutoplay)
