import { LightningElement, api, track, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getHierarchyOpportunities from '@salesforce/apex/XLP_POC_AccOppHierarchyTable.getHierarchyOpportunities';
import updateOpportunities from '@salesforce/apex/XLP_POC_AccOppHierarchyTable.updateOpportunities';

export default class XLP_POC_AccOppHierarchyTable extends LightningElement {

    @api recordId;
    @api tableTitle;
    @api accountContextType;   // 'Broker' or 'Insured'
    @api pipelineType;         // 'Pipeline' | 'Renewal' | 'Both'
    @api newRenewalType;       // 'New' | 'Renewal' | 'Any'
    @api stageName;            // e.g. 'Bound'
    @api requireExpiryDate;    // true / false
    @api requireInceptionDate;    // true / false
    @api sortField;            // e.g. XLP_GrossPremiumAXAXLAmount__c
    @api sortDirection;        // ASC / DESC

    _columns;                  // internal holder

    @track columnsDef = [];
    @track allData = [];
    @track tableData = [];
    @track draftValues = [];
    @track isLoading = true;

    pageSize = 10;
    pageNumber = 1;

    wiredResult;

    // ----- ATTRIBUTE SETTER FOR COLUMNS -----
    @api
    set columns(value) {
        this._columns = value;
        this.buildColumns();
    }

    get columns() {
        return this._columns;
    }

    connectedCallback() {
        this.buildColumns();
    }

    // ----- BUILD COLUMNS -----
    buildColumns() {
        this.columnsDef = [];

        const raw = (typeof this._columns === 'string' && this._columns.trim())
            ? this._columns
            : 'Name,StageName,RelatedAccount'; // default

        const parts = raw.split(',').map(c => c.trim()).filter(Boolean);

        parts.forEach(field => {
            if (field === 'Name') {
                this.columnsDef.push({
                    label: 'Opportunity Name',
                    fieldName: 'oppLink',
                    type: 'url',
                    typeAttributes: {
                        label: { fieldName: 'Name' },
                        target: '_blank'
                    }
                });
            }else if (field === 'Broker') {
                this.columnsDef.push({
                    label: 'Broker',
                    fieldName: 'brokerLink',
                    type: 'url',
                    typeAttributes: {
                        label: { fieldName: 'BrokerName' },
                        target: '_blank'
                    }
                });
            }else if (field === 'Insured') {
                this.columnsDef.push({
                    label: 'Insured',
                    fieldName: 'insuredLink',
                    type: 'url',
                    typeAttributes: {
                        label: { fieldName: 'InsuredName' },
                        target: '_blank'
                    }
                });
            }else if (field === 'Owner') {
                this.columnsDef.push({
                    label: 'Owner',
                    fieldName: 'ownerLink',
                    type: 'url',
                    typeAttributes: {
                        label: { fieldName: 'OwnerName' },
                        target: '_blank'
                    }
                });
            }else if (field === 'XLP_GrossPremiumAXAXLAmount__c') {
                this.columnsDef.push({
                    label: 'Gross Premium Amount',
                    fieldName: 'XLP_GrossPremiumAXAXLAmount__c',
                    type: 'currency',
                    editable: true
                });
            } else {
                let type = 'text';

                if (field.toLowerCase().includes('date')) {
                    type = 'date';
                } else if (
                    field.toLowerCase().includes('amount') ||
                    field.toLowerCase().includes('premium')
                ) {
                    type = 'currency';
                }

                this.columnsDef.push({
                    label: field,
                    fieldName: field,
                    type,
                    editable: true
                });
            }
        });
    }

    // ----- WIRE OPPORTUNITIES -----
    @wire(getHierarchyOpportunities, {
        accountId: '$recordId',
        accountContextType: '$accountContextType',
        pipelineType: '$pipelineType',
        newRenewalType: '$newRenewalType',
        stageName: '$stageName',
        requireExpiryDate: '$normalizedRequireExpiryDate',
        requireInceptionDate: '$normalizedRequireInceptionDate',
        sortField: '$sortField',
        sortDirection: '$sortDirection'
    })
    wiredOpps(result) {
        this.wiredResult = result;
        const { data, error } = result;
        this.isLoading = false;
        console.log('data');
        console.log(data);
        if (data) {
            this.allData = data.map(opp => {
                // Broker
                const brokerId = opp.XLP_BrokerName__c;
                const brokerName = opp.XLP_BrokerName__r ? opp.XLP_BrokerName__r.Name : null;
                // Insured
                const insuredId = opp.XLP_ClientName__c;
                const insuredName = opp.XLP_ClientName__r ? opp.XLP_ClientName__r.Name : null;
                // Owner
                const ownerId = opp.OwnerId;
                const ownerName = opp.Owner ? opp.Owner.Name : null;        
                return {
                    ...opp,
                    
                    // Opportunity link
                    oppLink: '/' + opp.Id,
            
                    // Broker link
                    brokerLink: brokerId ? '/' + brokerId : null,
                    BrokerName: brokerName,
            
                    // Insured link
                    insuredLink: insuredId ? '/' + insuredId : null,
                    InsuredName: insuredName,
            
                    // Owner link
                    ownerLink: ownerId ? '/' + ownerId : null,
                    OwnerName: ownerName
                };
            });
            
            this.pageNumber = 1;
            this.updatePagination();

        } else if (error) {
            this.showToast(
                'Error loading opportunities',
                this.reduceError(error),
                'error'
            );
            this.allData = [];
            this.tableData = [];
        }
    }

    // ----- PAGINATION -----
    updatePagination() {
        const start = (this.pageNumber - 1) * this.pageSize;
        const end = start + this.pageSize;
        this.tableData = this.allData.slice(start, end);
    }

    handleNext() {
        this.pageNumber++;
        this.updatePagination();
    }

    handlePrev() {
        this.pageNumber--;
        this.updatePagination();
    }

    get totalPages() {
        return Math.ceil(this.allData.length / this.pageSize) || 1;
    }

    get isFirstPage() {
        return this.pageNumber <= 1;
    }

    get isLastPage() {
        return this.pageNumber >= this.totalPages;
    }

    get hasData() {
        return this.allData.length > 0;
    }

    get normalizedRequireExpiryDate() {
        return this.normalizeBoolean(this.requireExpiryDate);
    }

    get normalizedRequireInceptionDate() {
        return this.normalizeBoolean(this.requireInceptionDate);
    }

    // ----- INLINE SAVE -----
    async handleSave(event) {
        this.isLoading = true;
        const updatedFields = event.detail.draftValues;
    
        try {
            await updateOpportunities({ opportunities: updatedFields });
    
            this.showToast(
                'Success',
                'Changes saved successfully',
                'success'
            );
    
            //Clear drafts
            this.draftValues = [];
    
            //Reload from DB
            await refreshApex(this.wiredResult);
    
            } catch (error) {
        
                this.showToast(
                    'Error updating opportunities',
                    this.reduceError(error),
                    'error'
                );
        
            } finally {
                this.isLoading = false;
            }
    }

    // ----- UTILITIES -----
    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }

    reduceError(error) {
        if (!error) return 'Unknown error';

        if (Array.isArray(error.body)) {
            return error.body.map(e => e.message).join(', ');
        }
        if (error.body && typeof error.body.message === 'string') {
            return error.body.message;
        }
        return error.message || 'Unknown error';
    }

    normalizeBoolean(value) {
        return value === true || value === 'true';
    }
}
