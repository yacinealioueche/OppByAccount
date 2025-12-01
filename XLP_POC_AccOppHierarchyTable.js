import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getHierarchyOpportunities from '@salesforce/apex/XLP_POC_AccOppHierarchyTable.getHierarchyOpportunities';
import updateOpportunities from '@salesforce/apex/XLP_POC_AccOppHierarchyTable.updateOpportunities';

export default class XLP_POC_AccOppHierarchyTable extends LightningElement {
    @api recordId;

    // Configurable inputs from App Builder
    @api tableTitle;
    @api accountContextType;   // 'Broker' or 'Insured'
    @api pipelineType;         // 'Pipeline' | 'Renewal' | 'Both'
    @api newRenewalType;       // 'New' | 'Renewal' | 'Any'
    @api stageName;            // e.g. 'Bound'
    @api requireExpiryDate;    // true/false
    @api sortField;            // e.g. 'XLP_GrossPremiumAXAXLAmount__c'
    @api sortDirection;        // 'ASC' / 'DESC'
    @api columns;              // comma separated: "Name,StageName,RelatedAccount,XLP_GrossPremiumAXAXLAmount__c"

    @track allData = [];
    @track tableData = [];
    @track draftValues = [];
    @track columnsDef = [];
    @track isLoading = true;

    pageSize = 10;
    pageNumber = 1;

    wiredResult;

    connectedCallback() {
        this.buildColumns();
    }

    // Build datatable columns based on comma-separated "columns" input
    buildColumns() {
        const cols = [];

        if (!this.columns) {
            // Default columns if none specified
            this.columns = 'Name,StageName,RelatedAccount,Amount,CloseDate';
        }

        const parts = this.columns.split(',').map(c => c.trim()).filter(Boolean);

        parts.forEach(field => {
            if (field === 'Name') {
                cols.push({
                    label: 'Opportunity Name',
                    fieldName: 'oppLink',
                    type: 'url',
                    typeAttributes: {
                        label: { fieldName: 'Name' },
                        target: '_blank'
                    }
                });
            } else if (field === 'RelatedAccount') {
                cols.push({
                    label: this.accountContextType === 'Insured' ? 'Insured Account' : 'Broker Account',
                    fieldName: 'relatedAccountLink',
                    type: 'url',
                    typeAttributes: {
                        label: { fieldName: 'RelatedAccountName' },
                        target: '_blank'
                    }
                });
            } else {
                // infer type
                let type = 'text';
                if (field.toLowerCase().includes('date')) {
                    type = 'date';
                } else if (
                    field.toLowerCase().includes('amount') ||
                    field.toLowerCase().includes('premium')
                ) {
                    type = 'currency';
                }
                cols.push({
                    label: field,
                    fieldName: field,
                    type: type,
                    editable: true
                });
            }
        });

        this.columnsDef = cols;
    }

    get columns() {
        return this.columnsDef;
    }

    @wire(getHierarchyOpportunities, {
        accountId: '$recordId',
        accountContextType: '$accountContextType',
        pipelineType: '$pipelineType',
        newRenewalType: '$newRenewalType',
        stageName: '$stageName',
        requireExpiryDate: '$requireExpiryDate',
        sortField: '$sortField',
        sortDirection: '$sortDirection'
    })
    wiredOpps(result) {
        this.wiredResult = result;
        const { data, error } = result;
        this.isLoading = false;

        if (data) {
            // Enrich rows with links and related account name
            this.allData = data.map(opp => {
                let relatedAccountId, relatedAccountName;

                if (this.accountContextType === 'Insured') {
                    relatedAccountId = opp.XLP_ClientName__c;
                    relatedAccountName = opp.XLP_ClientName__r ? opp.XLP_ClientName__r.Name : null;
                } else {
                    relatedAccountId = opp.XLP_BrokerName__c;
                    relatedAccountName = opp.XLP_BrokerName__r ? opp.XLP_BrokerName__r.Name : null;
                }

                return {
                    ...opp,
                    oppLink: '/' + opp.Id,
                    relatedAccountLink: relatedAccountId ? '/' + relatedAccountId : null,
                    RelatedAccountName: relatedAccountName
                };
            });

            this.pageNumber = 1;
            this.updatePagination();
        } else if (error) {
            this.showToast('Error loading opportunities', this.reduceError(error), 'error');
            this.allData = [];
            this.tableData = [];
        }
    }

    // Pagination helpers
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

    // Inline save
    async handleSave(event) {
        this.isLoading = true;
        const updatedFields = event.detail.draftValues;

        try {
            await updateOpportunities({ opportunities: updatedFields });
            this.showToast('Success', 'Opportunities updated', 'success');
            this.draftValues = [];
            // Requery wire
            // We can just call updatePagination after wire refresh, but simplest is to rely on wire
            // Reassigning wired property triggers refresh automatically on next change
        } catch (error) {
            this.showToast('Error updating opportunities', this.reduceError(error), 'error');
        } finally {
            this.isLoading = false;
        }
    }

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
        } else if (error.body && typeof error.body.message === 'string') {
            return error.body.message;
        }
        return error.message || 'Unknown error';
    }
}
