import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getHierarchyOpportunities from '@salesforce/apex/XLP_POC_AccOppHierarchyTable.getHierarchyOpportunities';
import updateOpportunities from '@salesforce/apex/XLP_POC_AccOppHierarchyTable.updateOpportunities';

const COLUMNS = [
    {
        label: 'Opportunity Name',
        fieldName: 'oppLink',
        type: 'url',
        typeAttributes: { label: { fieldName: 'Name' }, target: '_blank' }
    },
    { label: 'Stage', fieldName: 'StageName', editable: true },
    { label: 'Amount', fieldName: 'Amount', type: 'currency', editable: true },
    { label: 'Close Date', fieldName: 'CloseDate', type: 'date', editable: true },
    {
        label: 'Broker Account',
        fieldName: 'accountLink',
        type: 'url',
        typeAttributes: { label: { fieldName: 'AccountName' }, target: '_blank' }
    }
];

export default class XLP_POC_AccOppHierarchyTable extends LightningElement {

    @api recordId;
    columns = COLUMNS;

    @track allData = [];
    @track tableData = [];
    @track draftValues = [];
    @track isLoading = true;

    pageSize = 10;
    pageNumber = 1;

    // WIRE DATA
    @wire(getHierarchyOpportunities, { accountId: '$recordId' })
    wiredOpps({ data, error }) {
        this.isLoading = false;

        if (data) {
            this.allData = data.map(opp => ({
                ...opp,
                oppLink: '/' + opp.Id,
                accountLink: opp.XLP_BrokerName__c ? '/' + opp.XLP_BrokerName__c : null,
                AccountName: opp.XLP_BrokerName__r ? opp.XLP_BrokerName__r.Name : ''
            }));
            this.pageNumber = 1;
            this.updatePagination();
        } else if (error) {
            this.showToast('Error', this.reduceError(error), 'error');
            this.allData = [];
        }
    }

    // PAGINATION
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
        return Math.ceil(this.allData.length / this.pageSize);
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

    // INLINE SAVE
    async handleSave(event) {
        this.isLoading = true;

        try {
            await updateOpportunities({ opportunities: event.detail.draftValues });
            this.showToast('Success', 'Updated successfully', 'success');

            // Force reload
            window.location.reload();
        } catch (error) {
            this.showToast('Error', this.reduceError(error), 'error');
            this.isLoading = false;
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    reduceError(error) {
        if (Array.isArray(error.body)) return error.body.map(e => e.message).join(', ');
        if (typeof error.body?.message === 'string') return error.body.message;
        return 'Unknown error';
    }
}
