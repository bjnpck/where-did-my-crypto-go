# Crypto Card Tracker

## Vision

A privacy-first expense tracker that combines spending across multiple crypto debit cards into one dashboard.

## MVP

- CSV imports for EtherFi and Plasma
    
- Unified transaction history
    
- Automatic merchant categorization with manual corrections
    
- Monthly spending and category breakdowns
    
- Spending comparison by card
    
- Duplicate detection and refund handling
    
- Local storage, without accounts or backend
    

## Tech Stack

- Next.js + TypeScript
    
- Tailwind CSS
    
- Recharts
    
- IndexedDB
    

## Principles

- Privacy first: financial data stays in the browser
    
- Simple: no unnecessary features
    
- Accurate: spending must reconcile with source statements
    
- Extensible: new card providers should be easy to add
    

## First Milestone

Import actual EtherFi and Plasma CSV exports, normalize transactions, and verify spending totals.

## Out of Scope

Wallet connections, AI, cashback analytics, mobile apps, and authentication.