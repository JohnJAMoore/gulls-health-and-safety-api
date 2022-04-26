import transaction from 'sequelize/types/lib/transaction';
import database from '../models/index.js';
import config from '../config/app';
import ApplicationController from './application';
import AddressController from './address';
import ContactController from './contact';

const {Returns, ReturnSpecies, ReturnActivity} = database;

// Disabled rules because Notify client has no index.js and implicitly has "any" type, and this is how the import is done
// in the Notify documentation - https://docs.notifications.service.gov.uk/node.html
/* eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, unicorn/prefer-module, prefer-destructuring */
const NotifyClient = require('notifications-node-client').NotifyClient;

/**
 * Local interface to hold the species IDs used with the foreign keys.
 */
interface SpeciesIds {
  HerringGullId: number | undefined;
  BlackHeadedGullId: number | undefined;
  CommonGullId: number | undefined;
  GreatBlackBackedGullId: number | undefined;
  LesserBlackBackedGullId: number | undefined;
}

/**
 * Local interface to use when returning from the database.
 */
interface ReturnInterface {
  id: number;
  confirmedReturn: boolean;
  LicenceId: number;
  SpeciesId: number;
}

// Create a more user friendly displayable date from a date object.
const createDisplayDate = (date: Date) => {
  return date.toLocaleDateString('en-GB');
};

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

/**
 * This function will create a formatted string of specific species activities, used by Notify
 * to create the list of returned activities.
 *
 * @param {any} activities The activities being returned.
 * @param {string} speciesType The species the return relates to.
 * @returns {string} A list of formatted activities as a single species specific string.
 */
const addReturnActivities = (activities: any, speciesType: string): string => {
  const returnActivities: string[] = [];

  // Build the string for nest removal.
  if (activities.removeNests && activities.quantityNestsRemoved && activities.quantityEggsRemoved) {
    returnActivities.push(
      `${speciesType} - ${String(activities.quantityNestsRemoved)} nests removed and ${String(
        activities.quantityEggsRemoved,
      )} eggs removed on ${createDisplayDate(new Date(activities.dateNestsEggsRemoved))}`,
    );
  } else if (activities.removeNests && activities.quantityNestsRemoved) {
    returnActivities.push(
      `* ${speciesType} - ${String(activities.quantityNestsRemoved)} nests removed on ${createDisplayDate(
        new Date(activities.dateNestsEggsRemoved),
      )}`,
    );
  }

  // Build the string for egg destruction.
  if (activities.eggDestruction) {
    returnActivities.push(
      `${speciesType} - ${String(
        activities.quantityEggsDestroyed,
      )} eggs oiled pricked or replaced with dummy eggs from ${String(
        activities.quantityNestsAffected,
      )} nests on ${createDisplayDate(new Date(activities.dateNestsEggsDestroyed))}`,
    );
  }

  // Build the string for chicks taken to rescue centre, includes `rescueCentre`.
  if (activities.chicksToRescueCentre) {
    returnActivities.push(
      `${speciesType} - ${String(activities.quantityChicksToRescue)} chicks taken to ${String(
        activities.rescueCentre,
      )} on ${createDisplayDate(new Date(activities.dateChicksToRescue))}`,
    );
  }

  // Build the string for chicks relocated nearby.
  if (activities.chicksRelocatedNearby) {
    returnActivities.push(
      `${speciesType} - ${String(activities.quantityChicksRelocated)} chicks relocated nearby on ${createDisplayDate(
        new Date(activities.dateChicksRelocated),
      )}`,
    );
  }

  // Build the string for chicks killed.
  if (activities.killChicks) {
    returnActivities.push(
      `${speciesType} - ${String(activities.quantityChicksKilled)} chicks killed on ${createDisplayDate(
        new Date(activities.dateChicksKilled),
      )}`,
    );
  }

  // Build the string for adults killed.
  if (activities.killAdults) {
    returnActivities.push(
      `${speciesType} - ${String(activities.quantityAdultsKilled)} adults killed on ${createDisplayDate(
        new Date(activities.dateAdultsKilled),
      )}`,
    );
  }

  return returnActivities.join('\n');
};

/**
 * This function takes a map of species type and activity and generates the string used by Notify
 * to create the list of return activities.
 *
 * @param {Map<string, any>} returnDetails A list of returned activities mapped to the species type.
 * @returns {string} Returns the formatted string used by the Notify API for the list of returned activities.
 */
const createReturnDetails = (returnDetails: Map<string, any>): string => {
  const returnDetailsResults = [];
  if (returnDetails.has('Herring Gull')) {
    returnDetailsResults.push(addReturnActivities(returnDetails.get('Herring Gull'), 'Herring gull'));
  }

  if (returnDetails.has('Black-Headed Gull')) {
    returnDetailsResults.push(addReturnActivities(returnDetails.get('Black-Headed Gull'), 'Black-Headed Gull'));
  }

  if (returnDetails.has('Common Gull')) {
    returnDetailsResults.push(addReturnActivities(returnDetails.get('Common Gull'), 'Common Gull'));
  }

  if (returnDetails.has('Great Black-Backed Gull')) {
    returnDetailsResults.push(
      addReturnActivities(returnDetails.get('Great Black-Backed Gull'), 'Great Black-Backed Gull'),
    );
  }

  if (returnDetails.has('Lesser Black-Backed Gull')) {
    returnDetailsResults.push(
      addReturnActivities(returnDetails.get('Lesser Black-Backed Gull'), 'Lesser Black-Backed Gull'),
    );
  }

  return returnDetailsResults.join('\n');
};

/**
 * This function returns an object containing the details required for the license return notification email.
 *
 * @param {any} licenceId The ID of the licence to which the return pertains.
 * @param {any} returnDate The date of the return details.
 * @param {any} siteAddress The address of the site to which the return pertains.
 * @param {Map<string, any>} returnDetails A map containing the return details mapped to a species type string as a key.
 * @returns {any} An object with the required details set.
 */
const setReturnNotificationDetails = (
  licenceId: any,
  returnDate: any,
  siteAddress: any,
  returnDetails: Map<string, any>,
) => {
  return {
    id: licenceId,
    returnDate: createDisplayDate(new Date(returnDate)),
    siteAddress: createSummaryAddress(siteAddress),
    returnDetails: createReturnDetails(returnDetails),
  };
};

/**
 * This function calls the Notify API and asks for an email to be sent with the supplied details.
 *
 * @param {any} emailDetails The details to use in the email to be sent.
 * @param {any} emailAddress The email address to send the email to.
 */
const sendLicenceReturnNotificationEmail = async (emailDetails: any, emailAddress: any) => {
  if (config.notifyApiKey) {
    const notifyClient = new NotifyClient(config.notifyApiKey);
    await notifyClient.sendEmail('d5f606fd-2bc2-4d4e-ae46-faa2ea20e900', emailAddress, {
      personalisation: emailDetails,
      emailReplyToId: '4b49467e-2a35-4713-9d92-809c55bf1cdd',
    });
  }
};

const ReturnsController = {
  /**
   * This function returns a single return by ID.
   *
   * @param {number} id The primary key of the desired return.
   * @returns {any} Returns the return requests.
   */
  findOne: async (id: number) => {
    return Returns.findByPk(id, {
      paranoid: false,
      include: [
        {
          model: ReturnSpecies,
          as: 'ReturnSpecies',
          paranoid: false,
          include: [
            {
              model: ReturnActivity,
              as: 'ReturnHerringGull',
              paranoid: false,
            },
            {
              model: ReturnActivity,
              as: 'ReturnBlackHeadedGull',
              paranoid: false,
            },
            {
              model: ReturnActivity,
              as: 'ReturnCommonGull',
              paranoid: false,
            },
            {
              model: ReturnActivity,
              as: 'ReturnGreatBlackBackedGull',
              paranoid: false,
            },
            {
              model: ReturnActivity,
              as: 'ReturnLesserBlackBackedGull',
              paranoid: false,
            },
          ],
        },
      ],
    });
  },

  /**
   * This function gets all returns from the database.
   *
   * @returns {any} Returns all returns.
   */
  findAll: async () => {
    return Returns.findAll();
  },

  /**
   * The function creates a return record in the database.
   *
   * @param {any | undefined} cleanedReturn The cleaned return.
   * @param {any | undefined} herringReturnActivity The herring gull activities being returned.
   * @param {any | undefined} blackHeadedReturnActivity The black headed gull activities being returned.
   * @param {any | undefined} commonReturnActivity The common gull activities being returned.
   * @param {any | undefined} greatBlackBackedReturnActivity The great black-backed gull activities being returned.
   * @param {any | undefined} lesserBlackBackedReturnActivity The lesser black-backed gull activities being returned.
   * @returns {ReturnInterface} The newly created return.
   */
  create: async (
    cleanedReturn: any | undefined,
    herringReturnActivity: any | undefined,
    blackHeadedReturnActivity: any | undefined,
    commonReturnActivity: any | undefined,
    greatBlackBackedReturnActivity: any | undefined,
    lesserBlackBackedReturnActivity: any | undefined,
  ) => {
    const speciesIds: SpeciesIds = {
      HerringGullId: undefined,
      BlackHeadedGullId: undefined,
      CommonGullId: undefined,
      GreatBlackBackedGullId: undefined,
      LesserBlackBackedGullId: undefined,
    };

    let newReturn;

    // Add the returns for each species to the database, keeping a copy of the species ID.
    await database.sequelize.transaction(async (t: transaction) => {
      if (herringReturnActivity) {
        const herringGull = await ReturnActivity.create(herringReturnActivity, {transaction: t});
        speciesIds.HerringGullId = herringGull.id;
      }

      if (blackHeadedReturnActivity) {
        const blackHeadedGull = await ReturnActivity.create(blackHeadedReturnActivity, {transaction: t});
        speciesIds.BlackHeadedGullId = blackHeadedGull.id;
      }

      if (commonReturnActivity) {
        const commonGull = await ReturnActivity.create(commonReturnActivity, {transaction: t});
        speciesIds.CommonGullId = commonGull.id;
      }

      if (greatBlackBackedReturnActivity) {
        const greatBlackBackedGull = await ReturnActivity.create(greatBlackBackedReturnActivity, {transaction: t});
        speciesIds.GreatBlackBackedGullId = greatBlackBackedGull.id;
      }

      if (lesserBlackBackedReturnActivity) {
        const lesserBlackBackedGull = await ReturnActivity.create(lesserBlackBackedReturnActivity, {transaction: t});
        speciesIds.LesserBlackBackedGullId = lesserBlackBackedGull.id;
      }

      // Set the return's species foreign keys in the DB.
      const newReturnSpecies = await ReturnSpecies.create(speciesIds, {transaction: t});

      // Set the return's species foreign key.
      cleanedReturn.SpeciesId = newReturnSpecies.id;

      // Add the return to the database.
      newReturn = await Returns.create(cleanedReturn, {transaction: t});
    });

    let applicationDetails;

    if (newReturn) {
      // Grab the application to some details required for the notify email.
      applicationDetails = await ApplicationController.findOne((newReturn as any).LicenceId);
    }

    let siteAddress;

    // Grab the site address using the SiteAddressId of the application.
    if (applicationDetails?.SiteAddressId) {
      siteAddress = await AddressController.findOne(applicationDetails?.SiteAddressId);
    }

    let licenceHolder;
    let licenceApplicant;

    // Grab the licence holder's contact details.
    if (applicationDetails?.LicenceHolderId) {
      licenceHolder = await ContactController.findOne(applicationDetails?.LicenceHolderId);
    }

    // Grab the licence applicant's contact details.
    if (applicationDetails?.LicenceApplicantId) {
      licenceApplicant = await ContactController.findOne(applicationDetails?.LicenceApplicantId);
    }

    // Create an array of all of the submitted returns for each species, to be used by Notify.
    const returnDetails: Map<string, any> = new Map();

    if (herringReturnActivity) {
      returnDetails.set('Herring Gull', herringReturnActivity);
    }

    if (blackHeadedReturnActivity) {
      returnDetails.set('Black-Headed Gull', blackHeadedReturnActivity);
    }

    if (commonReturnActivity) {
      returnDetails.set('Common Gull', commonReturnActivity);
    }

    if (greatBlackBackedReturnActivity) {
      returnDetails.set('Great Black-Backed Gull', greatBlackBackedReturnActivity);
    }

    if (lesserBlackBackedReturnActivity) {
      returnDetails.set('Lesser Black-Backed Gull', lesserBlackBackedReturnActivity);
    }

    // If we have successfully submitted a return set the email details.
    if (newReturn) {
      const emailDetails = setReturnNotificationDetails(
        (newReturn as any).LicenceId,
        (newReturn as any).createdAt,
        siteAddress,
        returnDetails,
      );

      // If the licence holder and applicant are the same person only send a single email.
      if (licenceHolder && licenceHolder?.id === licenceApplicant?.id) {
        await sendLicenceReturnNotificationEmail(emailDetails, licenceHolder.emailAddress);
      } else {
        // Send an email to both holder and applicant.
        if (licenceHolder?.emailAddress) {
          await sendLicenceReturnNotificationEmail(emailDetails, licenceHolder.emailAddress);
        }

        if (licenceApplicant?.emailAddress)
          await sendLicenceReturnNotificationEmail(emailDetails, licenceApplicant.emailAddress);
      }
    }

    // If all went well and we have a new return return it.
    if (newReturn) {
      return newReturn as ReturnInterface;
    }

    // If all did not go so well return undefined.
    return undefined;
  },
};

export {ReturnsController as default};
