'use strict';
import renderProfile from './default.profile.template';

function toLua (element) {
  let properties = [];

  // Array
  if (Array.isArray(element)) {
    properties = element.map(value => `'${value}'`);
    return `{\n${properties.join(',\n')}\n}`;

  // Object
  } else if (typeof element === 'object') {
    Object.keys(element).forEach(key => {
      properties.push(`  ["${key}"] = ${toLua(element[key])}`);
    });
    return `{\n${properties.join(',\n')}\n}`;

  // String
  } else if (typeof element === 'string') {
    return `"${element}"`;

    // Other
  } else {
    return element;
  }
}

export function getOSRMProfileDefaultSpeedSettings () {
  return {
    speed_profile: {
      Expressway: 120,
      National: 80,
      Provincial: 60,
      Township: 20,
      County: 20,
      Rural: 20,
      motorway: 90,
      motorway_link: 45,
      trunk: 85,
      trunk_link: 40,
      primary: 65,
      primary_link: 30,
      secondary: 55,
      secondary_link: 25,
      tertiary: 40,
      tertiary_link: 20,
      unclassified: 25,
      residential: 25,
      living_street: 10,
      service: 15,
      ferry: 5,
      movable: 5,
      shuttle_train: 10,
      default: 10
    },
    surface_speeds: {
      cement: 80,
      compacted: 80,
      fine_gravel: 80,
      paving_stones: 60,
      metal: 60,
      bricks: 60,
      grass: 40,
      wood: 40,
      sett: 40,
      grass_paver: 40,
      gravel: 40,
      unpaved: 40,
      ground: 40,
      dirt: 40,
      pebblestone: 40,
      tartan: 40,
      cobblestone: 30,
      clay: 30,
      earth: 20,
      stone: 20,
      rocky: 20,
      sand: 20,
      mud: 10
    },
    tracktype_speeds: {
      grade1: 60,
      grade2: 40,
      grade3: 30,
      grade4: 25,
      grade5: 20
    },
    smoothness_speeds: {
      intermediate: 80,
      bad: 40,
      very_bad: 20,
      horrible: 10,
      very_horrible: 5,
      impassable: 0
    },
    maxspeed_table_default: {
      urban: 50,
      rural: 90,
      trunk: 110,
      motorway: 130
    },
    maxspeed_table: {
      'at:rural': 100,
      'at:trunk': 100,
      'be:motorway': 120,
      'by:urban': 60,
      'by:motorway': 110,
      'ch:rural': 80,
      'ch:trunk': 100,
      'ch:motorway': 120,
      'cz:trunk': 0,
      'cz:motorway': 0,
      'de:living_street': 7,
      'de:rural': 100,
      'de:motorway': 0,
      'dk:rural': 80,
      'fr:rural': 80,
      'gb:nsl_single': 96.54,
      'gb:nsl_dual': 112.63,
      'gb:motorway': 112.63,
      'nl:rural': 80,
      'nl:trunk': 100,
      'no:rural': 80,
      'no:motorway': 110,
      'pl:rural': 100,
      'pl:trunk': 120,
      'pl:motorway': 140,
      'ro:trunk': 100,
      'ru:living_street': 20,
      'ru:urban': 60,
      'ru:motorway': 110,
      'uk:nsl_single': 96.54,
      'uk:nsl_dual': 112.63,
      'uk:motorway': 112.63,
      'za:urban': 60,
      'za:rural': 100,
      'none': 140
    }
  };
}

export function renderProfileFile (settings) {
  const data = {};
  for (const key in settings) {
    const element = settings[key];
    data[key] = toLua(element);
  }

  return renderProfile(data);
}
