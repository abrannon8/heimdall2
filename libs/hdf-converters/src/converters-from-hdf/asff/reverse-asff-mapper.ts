import {contextualizeEvaluation, ExecJSON} from 'inspecjs';
import {MappedTransform} from '../../base-converter';
import {FromHdfBaseConverter} from '../reverse-base-converter';
import {IExecJSONASFF, IFindingASFF, IOptions} from './asff-types';
import {
  createProfileInfoFinding,
  getAllLayers,
  setupAwsAcct,
  setupControlStatus,
  setupCreated,
  setupDescr,
  setupDetailsAssume,
  setupFindingType,
  setupGeneratorId,
  setupId,
  setupProdFieldCheck,
  setupProductARN,
  setupRegion,
  setupRemRec,
  setupResourcesID,
  setupResourcesID2,
  setupSevLabel,
  setupSevOriginal,
  setupTitle,
  setupUpdated,
  statusCount
} from './transformers';

export type SegmentedControl = ExecJSON.Control & {
  result: ExecJSON.ControlResult;
  layersOfControl: (ExecJSON.Control & {
    fix?: string;
    profileInfo?: Record<string, unknown>;
  })[];
};

export interface ILookupPathASFF {
  path?: string;
  transformer?: (
    value: SegmentedControl,
    context?: FromHdfToAsffMapper
  ) => unknown;
  arrayTransformer?: (value: unknown[], file: ExecJSON.Execution) => unknown[];
  key?: string;
  passParent?: boolean;
}

export class FromHdfToAsffMapper extends FromHdfBaseConverter {
  mappings: MappedTransform<IExecJSONASFF, ILookupPathASFF> = {
    Findings: [
      {
        SchemaVersion: '2018-10-08',
        Id: {path: ``, transformer: setupId, passParent: true},
        ProductArn: {path: ``, transformer: setupProductARN, passParent: true},
        AwsAccountId: {path: ``, transformer: setupAwsAcct, passParent: true},
        Types: {
          transformer: () => ['Software and Configuration Checks']
        },
        CreatedAt: {path: ``, transformer: setupCreated},
        Region: {path: '', transformer: setupRegion, passParent: true},
        UpdatedAt: {path: ``, transformer: setupUpdated, passParent: true},
        GeneratorId: {
          path: '',
          transformer: setupGeneratorId,
          passParent: true
        },
        Title: {path: '', transformer: setupTitle},
        Description: {path: '', transformer: setupDescr},
        FindingProviderFields: {
          Severity: {
            Label: {path: '', transformer: setupSevLabel, passParent: true},
            Original: {path: '', transformer: setupSevLabel, passParent: true}
          },
          Types: {path: '', transformer: setupFindingType, passParent: true}
        },
        Remediation: {
          Recommendation: {
            Text: {path: '', transformer: setupRemRec}
          }
        },
        ProductFields: {
          Check: {path: '', transformer: setupProdFieldCheck}
        },
        Severity: {
          Label: {path: '', transformer: setupSevLabel, passParent: true},
          Original: {path: '', transformer: setupSevOriginal}
        },
        Resources: [
          {
            Type: 'AwsAccount',
            Id: {path: '', transformer: setupResourcesID, passParent: true},
            Partition: 'aws',
            Region: {path: '', transformer: setupRegion, passParent: true}
          },
          {
            Id: {path: '', transformer: setupResourcesID2},
            Type: 'AwsIamRole',
            Details: {
              AwsIamRole: {
                AssumeRolePolicyDocument: {
                  path: '',
                  transformer: setupDetailsAssume
                }
              }
            }
          }
        ],
        Compliance: {
          RelatedRequirements: {
            transformer: () => [
              'SEE REMEDIATION FIELD FOR RESULTS AND RECOMMENDED ACTION(S)'
            ]
          },
          Status: {path: '', transformer: setupControlStatus}
        }
      }
    ]
  };

  contextProfiles: any;
  counts: any;
  ioptions: IOptions;
  index?: number;

  impactMapping: Map<number, string> = new Map([
    [0.9, 'CRITICAL'],
    [0.7, 'HIGH'],
    [0.5, 'MEDIUM'],
    [0.3, 'LOW'],
    [0.0, 'INFORMATIONAL']
  ]);

  constructor(hdfObj: ExecJSON.Execution, options: IOptions | undefined) {
    super(hdfObj);
    this.ioptions = options === undefined ? this.defaultOptions() : options;
    this.contextProfiles = contextualizeEvaluation(hdfObj);
    this.counts = statusCount(this.contextProfiles);
  }

  defaultOptions(): IOptions {
    return {
      input: '',
      awsAccountId: '',
      target: 'default',
      region: ''
    };
  }

  setMappings(
    customMappings: MappedTransform<IExecJSONASFF, ILookupPathASFF>
  ): void {
    super.setMappings(customMappings);
  }

  // Security hub currently works at the sub-control level, meaning we need to create our mapped data based off control.results
  controlsToSegments() {
    const segments: SegmentedControl[] = [];
    this.data.profiles.forEach((profile) => {
      profile.controls.reverse().forEach((control) => {
        control.results.forEach((segment) => {
          // Ensure that the UpdatedAt time is different accross findings (to match the order in HDF)
          segments.push({
            ...control,
            result: segment,
            layersOfControl: getAllLayers(this.data, control)
          });
        });
      });
    });

    return segments;
  }

  //Convert from HDF to ASFF
  toAsff(): IFindingASFF[] {
    if (this.mappings === undefined) {
      throw new Error('Mappings must be provided');
    } else {
      //Recursively transform the data into ASFF format
      //Returns an array of the findings
      const resList: IFindingASFF[] = this.controlsToSegments().map(
        (segment, index) => {
          this.index = index;
          return this.convertInternal(segment, this.mappings)[
            'Findings'
          ][0] as IFindingASFF;
        }
      );
      resList.push(createProfileInfoFinding(this.data, this.ioptions));
      return resList;
    }
  }
}
