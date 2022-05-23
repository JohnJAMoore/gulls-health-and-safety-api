import transaction from 'sequelize/types/lib/transaction';
import database from '../models/index.js';
import ApplicationController from './application';
import {AdvisoryInterface} from '../models/advisory.js';
import {ConditionInterface} from '../models/condition.js';
import config from '../config/app';

const {Amendment, ASpecies, AActivity, AmendCondition, AmendAdvisory, Note} = database;

// Disabled rules because Notify client has no index.js and implicitly has "any" type, and this is how the import is done
// in the Notify documentation - https://docs.notifications.service.gov.uk/node.html
/* eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, unicorn/prefer-module, prefer-destructuring */
const NotifyClient = require('notifications-node-client').NotifyClient;

interface SpeciesIds {
  HerringGullId: number | undefined;
  BlackHeadedGullId: number | undefined;
  CommonGullId: number | undefined;
  GreatBlackBackedGullId: number | undefined;
  LesserBlackBackedGullId: number | undefined;
}

interface AmendmentInterface {
  id: number | undefined;
  amendReason: string | undefined;
  amendedBy: string | undefined;
  assessment: string | undefined;
}

/**
 * This function returns a summary address built from the address fields of an address object.
 *
 * @param {any} fullAddress The address to use to build the summary address from.
 * @returns {string} Returns a string containing the summary address.
 */
 const createSummaryAddress = (fullAddress: any): string => {
  const address = [];
  address.push(fullAddress.addressLine1.trim());
  // As addressLine2 is optional we need to check if it exists.
  if (fullAddress.addressLine2) {
    address.push(fullAddress.addressLine2.trim());
  }

  address.push(fullAddress.addressTown.trim(), fullAddress.addressCounty.trim(), fullAddress.postcode.trim());

  return address.join(', ');
};


// Create a more user friendly displayable date from a date object.
const createDisplayDate = (date: Date) => {
  return date.toLocaleDateString('en-GB', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
};

/**
 * This function creates a formatted string of species and the activities permitted
 * in the licence to be issued.
 *
 * @param {any} species The species the activities pertain to.
 * @returns {string} Returns a string with all species and licenced activities.
 */
 const createPermittedActivitiesList = (species: any): string => {
  const permittedActivities = [];

  permittedActivities.push('Numbers permitted for amended activities are the total for the site, not additional to those already permitted.');

  if (species.HerringGullId) {
    permittedActivities.push(addActivities(species.AHerringGull, 'Herring gull'));
  }

  if (species.BlackHeadedGullId) {
    permittedActivities.push(addActivities(species.ABlackHeadedGull, 'Black-headed gull'));
  }

  if (species.CommonGullId) {
    permittedActivities.push(addActivities(species.ACommonGull, 'Common gull'));
  }

  if (species.GreatBlackBackedGullId) {
    permittedActivities.push(addActivities(species.AGreatBlackBackedGull, 'Great black-backed gull'));
  }

  if (species.LesserBlackBackedGullId) {
    permittedActivities.push(addActivities(species.ALesserBlackBackedGull, 'Lesser black-backed gull'));
  }

  return permittedActivities.join('\n');
};

/**
 * This function adds the activities to a supplied species string.
 *
 * @param {any} species The species for which the activities to be licenced pertains.
 * @param {string} speciesType A string representing the species name.
 * @returns {string} Returns a formatted string of all activities for the given species.
 */
const addActivities = (species: any, speciesType: string): string => {
  const activities: string[] = [];
  if (species.removeNests) {
    activities.push(
      `${speciesType}: To take and destroy ${String(
        species.quantityNestsToRemove,
      )} nests and any eggs they contain by hand.`,
    );
  }

  if (species.eggDestruction) {
    activities.push(
      `${speciesType}: To take and destroy eggs from ${String(
        species.quantityNestsWhereEggsDestroyed,
      )} nests by oiling, pricking or replacing with dummy eggs.`,
    );
  }

  if (species.chicksToRescueCentre) {
    activities.push(
      `${speciesType}: To take ${String(
        species.quantityChicksToRescue,
      )} chicks to a wildlife rescue centre by hand, net or trap.`,
    );
  }

  if (species.chicksRelocateNearby) {
    activities.push(
      `${speciesType}: To take ${String(
        species.quantityChicksToRelocate,
      )} chicks and relocate nearby by hand, net or trap.`,
    );
  }

  if (species.killChicks) {
    activities.push(
      `${speciesType}: To kill up to ${String(
        species.quantityChicksToKill,
      )} chicks by shooting or by hand, net or trap.`,
    );
  }

  if (species.killAdults) {
    activities.push(
      `${speciesType}: To kill up to ${String(
        species.quantityAdultsToKill,
      )} adults by shooting, falconry or by hand, net or trap.`,
    );
  }

  return activities.join('\n');
};


/**
 * This function calls the Notify API and asks for an email to be sent to the supplied address.
 *
 * @param {any} emailAddress The email address to send the email to.
 */
const sendAmendedEmail = async (emailAddress: string) => {
  if (config.notifyApiKey) {
    const notifyClient = new NotifyClient(config.notifyApiKey);
    await notifyClient.sendEmail('9cfcaca5-ef5d-46c4-8ccf-328bcf67ad6d', emailAddress, {
      emailReplyToId: '4b49467e-2a35-4713-9d92-809c55bf1cdd',
    });
  }
};

const setAmendEmailPersonalisationFields = (application: any) => {
  return {
    licenceNumber: application.id,
    siteAddress: createSummaryAddress(application.SiteAddress),
    startDate: createDisplayDate(application.License.periodFrom),
    endDate: createDisplayDate(application.License.periodTo),
    licenceHolderName: application.LicenceHolder.name,
    licenceHolderAddress: createSummaryAddress(application.LicenceHolderAddress),
    permittedActivities: createPermittedActivitiesList(application.License.Amendment.ASpecies)
    licenceConditions:
    advisoryNotes:
    statementReason:
    conservationStatus:
  }
}

const AmendmentController = {
  /**
   * This function returns a single amendment by ID.
   *
   * @param {number} id The primary key of the desired amendment.
   * @returns {any} Returns the amendment.
   */
  findOne: async (id: number) => {
    return Amendment.findByPk(id, {
      paranoid: false,
      include: [
        {
          model: ASpecies,
          as: 'ASpecies',
          paranoid: false,
          include: [
            {
              model: AActivity,
              as: 'AHerringGull',
              paranoid: false,
            },
            {
              model: AActivity,
              as: 'ABlackHGull',
              paranoid: false,
            },
            {
              model: AActivity,
              as: 'ACommonGull',
              paranoid: false,
            },
            {
              model: AActivity,
              as: 'AGreatBBGull',
              paranoid: false,
            },
            {
              model: AActivity,
              as: 'ALesserBBGull',
              paranoid: false,
            },
          ],
        },
        {
          model: AmendCondition,
          as: 'AmendConditions',
        },
        {
          model: AmendAdvisory,
          as: 'AmendAdvisories',
        },
      ],
    });
  },

  /**
   * This function gets all amendments from the database.
   *
   * @returns {any} Returns all amendments.
   */
  findAll: async () => {
    return Amendment.findAll();
  },

  /**
   * This function creates a new amendment record in the database.
   *
   * @param {any} incomingAmendment The new amendment.
   * @param {any | undefined} herringAmend Any amendments to herring gull activities.
   * @param {any | undefined} blackHeadedAmend Any amendments to black-headed gull activities.
   * @param {any | undefined} commonAmend Any amendments to common gull activities.
   * @param {any | undefined} greatBlackBackedAmend Any amendments to great black-backed gull activities.
   * @param {any | undefined} lesserBlackBackedAmend Any amendments to lesser black-backed gull activities.
   * @param {ConditionInterface[] | undefined} optionalConditions Amended optional conditions.
   * @param {AdvisoryInterface[] | undefined} optionalAdvisories Amended optional advisories.
   * @returns {AmendmentInterface | undefined} Returns a successfully created amendment, or undefined.
   */
  create: async (
    incomingAmendment: any,
    herringAmend: any | undefined,
    blackHeadedAmend: any | undefined,
    commonAmend: any | undefined,
    greatBlackBackedAmend: any | undefined,
    lesserBlackBackedAmend: any | undefined,
    optionalConditions: ConditionInterface[] | undefined,
    optionalAdvisories: AdvisoryInterface[] | undefined,
  ) => {
    const aSpeciesIds: SpeciesIds = {
      HerringGullId: undefined,
      BlackHeadedGullId: undefined,
      CommonGullId: undefined,
      GreatBlackBackedGullId: undefined,
      LesserBlackBackedGullId: undefined,
    };

    let newAmendment;
    // Start a transaction.
    await database.sequelize.transaction(async (t: transaction) => {
      // Add any species specific activities to the DB and get their IDs.
      if (herringAmend) {
        const herringGull = await AActivity.create(herringAmend, {transaction: t});
        aSpeciesIds.HerringGullId = herringGull.id;
      }

      if (blackHeadedAmend) {
        const blackHeadedGull = await AActivity.create(blackHeadedAmend, {transaction: t});
        aSpeciesIds.BlackHeadedGullId = blackHeadedGull.id;
      }

      if (commonAmend) {
        const commonGull = await AActivity.create(commonAmend, {transaction: t});
        aSpeciesIds.CommonGullId = commonGull.id;
      }

      if (greatBlackBackedAmend) {
        const greatBlackBackedGull = await AActivity.create(greatBlackBackedAmend, {transaction: t});
        aSpeciesIds.GreatBlackBackedGullId = greatBlackBackedGull.id;
      }

      if (lesserBlackBackedAmend) {
        const lesserBlackBackedGull = await AActivity.create(lesserBlackBackedAmend, {transaction: t});
        aSpeciesIds.LesserBlackBackedGullId = lesserBlackBackedGull.id;
      }

      // Set the species foreign keys in the DB.
      const newASpecies = await ASpecies.create(aSpeciesIds, {transaction: t});

      // Set the new species ID of the amendment.
      incomingAmendment.SpeciesId = newASpecies.id;

      // Create the amendment.
      newAmendment = await Amendment.create(incomingAmendment, {transaction: t});

      const amendmentId = newAmendment.id;

      if (optionalConditions) {
        await Promise.all(
          optionalConditions.map(async (optionalJsonCondition) => {
            await AmendCondition.create(
              {
                AmendmentId: amendmentId,
                ConditionId: optionalJsonCondition.id,
              },
              {transaction: t},
            );
          }),
        );
      }

      if (optionalAdvisories) {
        await Promise.all(
          optionalAdvisories.map(async (optionalJsonAdvisory) => {
            await AmendAdvisory.create(
              {
                AmendmentId: amendmentId,
                AdvisoryId: optionalJsonAdvisory.id,
              },
              {transaction: t},
            );
          }),
        );
      }

      // Post amendReason to Notes table.
      const amendmentNote = {
        Note: incomingAmendment.amendReason,
        createdBy: incomingAmendment.amendedBy,
        ApplicationId: incomingAmendment.LicenceId,
      };

      await Note.create(amendmentNote, {transaction: t});
    });

    // We need the licence application details to create the amendment email.
    const application = (await ApplicationController.findOne(incomingAmendment.LicenceId)) as any;

    // Send Notify email if we have a licence holder email address.
    if (incomingAmendment.licenceHolderEmailAddress) {
      const emailDetails = setAmendEmailPersonalisationFields(application)
      await sendAmendedEmail(incomingAmendment.licenceHolderEmailAddress, emailDetails);
    }

    // Send Notify email if we have a licence applicant email address.
    if (incomingAmendment.licenceApplicantEmailAddress) {
      await sendAmendedEmail(incomingAmendment.licenceApplicantEmailAddress);
    }

    await sendAmendedEmail('issuedlicence@nature.scot');

    // If all went well return the new amendment.
    if (newAmendment) {
      return newAmendment as AmendmentInterface;
    }

    // If all did not go well return undefined.
    return undefined;
  },
};

export {AmendmentController as default};
export {AmendmentInterface};
