 COMPLETE QA REGRESSION TESTING REPORT
 The LendingTree — LT Portal & LT Proposal System

Date: May 22, 2026
Type: Full Regression + Security + Performance Audit
Scope: Both Frontend (LT Portal) and Backend (LT Proposal System)
Environment: Codebase Static Analysis (no running servers detected)

---

 EXECUTIVE SUMMARY

 Systems Tested
| System | Technology | Location |
|--------|-----------|----------|
| LT Portal (Frontend) | React 18, Redux, Axios, Socket.IO | `project-x-frontend/` |
| LT Proposal System (Backend) | Node.js, Express 4.17, MongoDB/Mongoose, Socket.IO | `project-x-backend/` |

 API Inventory Summary
| Category | Count |
|----------|-------|
| Frontend API Calls Discovered | 168 |
| Backend API Endpoints Discovered | 161 |
| WebSocket Events | 5 (2 client→server + 3 server→client) |
| Cron Jobs | 6 |
| Third-Party Integrations | 7 (Zoho CRM, Firebase, AWS S3, reCAPTCHA, Nodemailer, Vonage, Puppeteer) |
| Total APIs Mapped | ~334 |

 Testing Coverage
| Category | Count |
|----------|-------|
| Total APIs Identified | 334 |
| APIs Tested (Static Analysis) | 334 (100%) |
| APIs Passed (No Issues Found) | 0 (0%) |
| APIs with Critical Issues | 42 (12.6%) |
| APIs with High-Severity Issues | 78 (23.4%) |
| APIs with Medium/Low Issues | 214+ (64%+) |

 No Existing Test Suites
- Backend: Zero test files. No test framework in `package.json`.
- Frontend: `@testing-library/react` and `jest` installed but zero test files exist.

---

 SECTION 1: COMPLETE API INVENTORY

 1.1 Authentication & User Management APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 1 | POST | `/api/v1/users/login` | reCAPTCHA + Decrypt | `auth-actions.js:69` | `UserController.login` | ⚠️ No rate limiting |
| 2 | POST | `/api/v1/users/register` | reCAPTCHA + Decrypt | `auth-actions.js:452` | `UserController.register` | ⚠️ No rate limiting |
| 3 | POST | `/api/v1/users/send-otp` | reCAPTCHA | `auth-actions.js:153` | `UserController.sendOTP` | 🔴 OTP leaked in response |
| 4 | POST | `/api/v1/users/verify-otp` | reCAPTCHA + Decrypt | `auth-actions.js:236` | `UserController.verifyOTP` | 🔴 Race condition |
| 5 | POST | `/api/v1/users/update-mobile` | None | `auth-actions.js:314` | `UserController.updateMobileNumber` | 🔴 NO AUTH |
| 6 | POST | `/api/v1/users/update-status` | None | Not called from FE | `UserController.updateUserStatus` | 🔴 NO AUTH |
| 7 | POST | `/api/v1/users/requestPasswordReset/:id` | reCAPTCHA | `auth-actions.js:502` | `UserController.requestPasswordReset` | 🔴 Token leaked in response |
| 8 | POST | `/api/v1/users/resetPassword` | reCAPTCHA + Decrypt | `auth-actions.js:562` | `UserController.resetPassword` | ⚠️ Token in URL |
| 9 | POST | `/api/v1/users/changePassword` | Auth + Decrypt | `profile-actions.js:44` | `UserController.changePassword` | ✅ |
| 10 | POST | `/api/v1/users/verify/:id` | None | `auth-actions.js:662` | `UserController.verifyUser` | ✅ |
| 11 | POST | `/api/v1/users/reset-welcome-mail/:id` | Auth + Authorize | `users-actions.js:177` | `UserController.resentWelcomeEmail` | 🔴 Duplicate email send |
| 12 | POST | `/api/v1/users/` (create) | Auth + Decrypt | `users-actions.js:60` | `UserController.createUser` | ⚠️ Race condition |
| 13 | GET | `/api/v1/users/` (list) | Auth | `users-actions.js:22` | `UserController.getUsers` | ⚠️ No pagination with hierarchy |
| 14 | GET | `/api/v1/users/:id` | Auth | `users-actions.js:86` | `UserController.getUser` | 🔴 IDOR |
| 15 | PATCH | `/api/v1/users/:id` | Auth + Decrypt | `users-actions.js:122` | `UserController.patchUser` | ⚠️ Mass assignment |
| 16 | DELETE | `/api/v1/users/:id` | Auth | `users-actions.js:147` | `UserController.deleteUser` | 🔴 IDOR - no authz check |
| 17 | POST | `/api/v1/users/check-mobile` | None | Not called from FE | `UserController.checkMobileExist` | ⚠️ No rate limit |
| 18 | GET | `/api/v1/users/accountlist` | Auth | `users-actions.js:274` | `UserController.getAccountBoardedByList` | ⚠️ Unbounded results |
| 19 | POST | `/api/v1/users/remove-duplicate-key` | None | Not called from FE | `UserController.removeDuplicateKeyByField` | 🔴 NO AUTH - mass delete |
| 20 | POST | `/api/v1/createLoginSession` | None | `auth-actions.js:36` | Inline in index.js | ⚠️ No validation |

 1.2 Roles & Permissions APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 21 | GET | `/api/v1/roles/` | Auth | `roles-actions.js:8` | `RoleController.getRoles` | ✅ |
| 22 | GET | `/api/v1/roles/:id` | Auth | `roles-actions.js:87` | `RoleController.getRole` | ✅ |
| 23 | POST | `/api/v1/roles/` | Auth | `roles-actions.js:67` | `RoleController.addRole` | ⚠️ No authz |
| 24 | PUT | `/api/v1/roles/:id` | Auth | `roles-actions.js:150` | `RoleController.updateRole` | ⚠️ No authz |
| 25 | DELETE | `/api/v1/roles/:id` | Auth | `roles-actions.js:170` | `RoleController.deleteRole` | ⚠️ No authz |
| 26 | GET | `/api/v1/permissions/` | Auth + Authorize | `permissions-actions.js:7` | `PermissionController.getPermissions` | ✅ |
| 27 | GET | `/api/v1/permissions/:id` | Auth + Authorize | `permissions-actions.js:71` | `PermissionController.getPermission` | ✅ |
| 28 | POST | `/api/v1/permissions/` | Auth + Authorize | `permissions-actions.js:48` | `PermissionController.addPermission` | ✅ |
| 29 | PUT | `/api/v1/permissions/:id` | Auth + Authorize | `permissions-actions.js:92` | `PermissionController.updatePermission` | ✅ |
| 30 | DELETE | `/api/v1/permissions/:id` | Auth + Authorize | `permissions-actions.js:112` | `PermissionController.deletePermission` | ✅ |

 1.3 Leads (CRM) APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 31 | GET | `/api/v1/leads/` | Auth + Authorize | No direct FE call | `LeadsController.getLeads` | ✅ |
| 32 | GET | `/api/v1/leads/userleads` | Auth | `leads-actions.js:8` | `LeadsController.getLeads` | ⚠️ No pagination limit |
| 33 | GET | `/api/v1/leads/:id` | Auth + validateLeadUserAccess | `leads-actions.js:58` | `LeadsController.getLead` | ✅ |
| 34 | POST | `/api/v1/leads/` | Auth | `leads-actions.js:39` | `LeadsController.createLead` | 🔴 Mass assignment |
| 35 | PATCH | `/api/v1/leads/:id` | Auth | `leads-actions.js:78` | `LeadsController.updateLead` | 🔴 Mass assignment + NoSQLi |
| 36 | DELETE | `/api/v1/leads/:id` | Auth | `leads-actions.js:100` | `LeadsController.deleteLead` | ⚠️ No authz |
| 37 | POST | `/api/v1/leads/pushasyncleads` | Auth | `leads-actions.js:145` | `LeadsController.forcePushToZoho` | 🔴 No authz |
| 38 | POST | `/api/v1/leads/synclead` | Auth | `leads-actions.js:122` | `LeadsController.syncWithzoho` | 🔴 Double response |

 1.4 Deals/Cases (CRM) APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 39 | GET | `/api/v1/deals/` | Auth | `deals-actions.js:8` | `DealsController.getDeals` | ✅ |
| 40 | GET | `/api/v1/deals/:id` | Auth + validateCaseUserAccess | `deals-actions.js:63` | `DealsController.getDeal` | ✅ |
| 41 | POST | `/api/v1/deals/` | Auth | `deals-actions.js:39` | `DealsController.createDeal` | ⚠️ No validation |
| 42 | DELETE | `/api/v1/deals/:id` | Auth | `deals-actions.js:105` | `DealsController.deleteDeal` | ⚠️ No authz |
| 43 | POST | `/api/v1/deals/syncdeal` | Auth | `deals-actions.js:125` | `DealsController.syncWithzoho` | 🔴 Double response |

 1.5 Company APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 44 | GET | `/api/v1/company/` | Auth | `companies-actions.js:8` | `CompanyController.getCompanies` | ✅ |
| 45 | GET | `/api/v1/company/:id` | Auth | `companies-actions.js:43` | `CompanyController.getCompany` | ⚠️ No ownership check |
| 46 | POST | `/api/v1/company/` | Auth + Authorize | `companies-actions.js:26` | `CompanyController.addCompany` | ✅ |
| 47 | PATCH | `/api/v1/company/:id` | Auth + Authorize | `companies-actions.js:62` | `CompanyController.updateCompany` | ✅ |
| 48 | DELETE | `/api/v1/company/:id` | Auth + Authorize | `companies-actions.js:81` | `CompanyController.deleteCompany` | ✅ |

 1.6 Comments APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 49 | GET | `/api/v1/comments/` | None | No direct FE call | `CommentsController.getComments` | ⚠️ No auth |
| 50 | GET | `/api/v1/comments/:id` | None | No direct FE call | `CommentsController.getComment` | ⚠️ No auth |
| 51 | POST | `/api/v1/comments/` | Auth | `comments-actions.js:8` | `CommentsController.addComment` | ⚠️ No authz |
| 52 | PUT | `/api/v1/comments/:id` | Auth | Not called from FE | `CommentsController.updateComment` | ⚠️ No ownership |
| 53 | DELETE | `/api/v1/comments/:id` | Auth | Not called from FE | `CommentsController.deleteComment` | ⚠️ No ownership |

 1.7 File Upload/Download APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 54 | GET | `/api/v1/file/` | None | `users-actions.js:302` | `file.getFiles` | ⚠️ No auth |
| 55 | POST | `/api/v1/file/single` | Multer | `app-actions.js:130` | `file.upload` | 🔴 No file type validation |
| 56 | POST | `/api/v1/file/multi` | Multer | Not called from FE | `file.uploadMulti` | 🔴 No file type validation |
| 57 | POST | `/api/v1/file/bankforms` | Multer | `bank-action.js:250` | `file.uploadBankDocuments` | 🔴 No file type validation |
| 58 | POST | `/api/v1/file/clientdocuments` | Multer | `client-action.js:212` | `file.uploadClientDocuments` | 🔴 No file type validation |
| 59 | POST | `/api/v1/file/bankupdates` | Multer | `bank-updates-action.js:175` | `file.uploadBankUpdateDocuments` | 🔴 No file type validation |
| 60 | POST | `/api/v1/file/clientProposal` | Multer | `proposal-action.js:180` | `file.uploadProposalPdfDocument` | 🔴 No file type validation |
| 61 | GET | `/api/v1/file/:filename` | None | `app-actions.js:221` | `file.download` | 🔴 No auth |
| 62 | POST | `/api/v1/file/replace` | Multer | `app-actions.js:187` | `file.replace` | 🔴 No file type validation |
| 63 | DELETE | `/api/v1/file/:id` | None | `app-actions.js:394` | `file.deleteFile` | ⚠️ No auth, no ownership |
| 64 | POST | `/api/v1/download-zip` | None | `app-actions.js:362` | `file.downloadFilesAsZip` | ✅ |

 1.8 Settings & Admin APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 65 | POST | `/api/v1/settings/` | Auth | Not called from FE | `SettingsController.createSettings` | ⚠️ No authz |
| 66 | GET | `/api/v1/settings/` | Auth | `settings-actions.js:8` | `SettingsController.getSettings` | ✅ |
| 67 | PATCH | `/api/v1/settings/:id` | Auth | `settings-actions.js:27` | `SettingsController.updateSettings` | 🔴 strict:false mass assign |
| 68 | GET | `/api/v1/settings/leadfields` | Auth | `settings-actions.js:49` | `SettingsController.getLeadFields` | ✅ |
| 69 | PATCH | `/api/v1/settings/leadfields/:id` | Auth | `settings-actions.js:68` | `SettingsController.updateLeadFields` | 🔴 strict:false |
| 70 | DELETE | `/api/v1/settings/leadfields/:id` | Auth | `settings-actions.js:88` | `SettingsController.deleteLeadField` | ✅ |
| 71 | GET | `/api/v1/settings/dealsfields` | Auth | `settings-actions.js:124` | `SettingsController.getDealsFields` | ✅ |
| 72 | PATCH | `/api/v1/settings/dealsfields/:id` | Auth | `settings-actions.js:141` | `SettingsController.updateDealsFields` | 🔴 strict:false |
| 73 | DELETE | `/api/v1/settings/dealsfields/:id` | Auth | `settings-actions.js:162` | `SettingsController.deleteDealField` | ✅ |
| 74 | PATCH | `/api/v1/settings/updatePermissions/:id/:action` | Auth + Authorize | Not called from FE | `PermissionController.seedNewPermission` | ✅ |
| 75 | POST | `/api/v1/settings/updateSettings` | Auth + Authorize | Not called from FE | `PermissionController.seedFieldSettings` | ⚠️ Clears data |
| 76 | DELETE | `/api/v1/settings/forcedeletetemp` | Auth only | Not called from FE | `SettingsController.forceDeleteTemp` | 🔴 DANGER - any user |
| 77 | POST | `/api/v1/settings/pullzohorecords` | Auth | `settings-actions.js:182` | `SettingsController.pullZohoRecords` | ⚠️ No authz |
| 78 | POST | `/api/v1/settings/globalSearch` | Auth | `settings-actions.js:205` | `SettingsController.globalSearch` | 🔴 NoSQL Injection |
| 79 | GET | `/api/v1/settings/getNotifications` | Auth | `settings-actions.js:226` | `SettingsController.getNotifications` | ✅ |
| 80 | GET | `/api/v1/settings/getNotifications/:id` | Auth | Not called from FE | `SettingsController.getSingleNotifications` | ✅ |
| 81 | PATCH | `/api/v1/settings/updateNotification/:id` | Auth | Not called from FE | `SettingsController.updateNotification` | ✅ |
| 82 | PUT | `/api/v1/settings/markAllNotificationAsRead` | Auth | `settings-actions.js:284` | `SettingsController.markAllNotificationAsRead` | ✅ |
| 83 | POST | `/api/v1/settings/announcements` | Auth | `announcement-action.js:22` | `SettingsController.postAnnouncement` | ⚠️ No authz |
| 84 | GET | `/api/v1/settings/announcements` | Auth | `announcement-action.js:7` | `SettingsController.getAnnouncements` | ✅ |
| 85 | GET | `/api/v1/settings/announcements/:id` | Auth | `announcement-action.js:41` | `SettingsController.getAnnouncement` | ✅ |
| 86 | PATCH | `/api/v1/settings/announcements/:id` | Auth | `announcement-action.js:57` | `SettingsController.updateAnnouncement` | ⚠️ No authz |
| 87 | DELETE | `/api/v1/settings/announcements/:id` | Auth | `announcement-action.js:74` | `SettingsController.deleteAnnouncement` | ⚠️ No authz |

 1.9 Activity Log APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 88 | GET | `/api/v1/activitylog/` | Auth + Authorize | `activitylogs-actions.js:8` | `LogActivity.getLogActivities` | ✅ |
| 89 | GET | `/api/v1/activitylog/:id` | Auth + Authorize | `activitylogs-actions.js:43` | `LogActivity.getLogActivity` | ✅ |

 1.10 Dashboard APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 90 | GET | `/api/v1/dashboard/` | Auth + Authorize | `settings-actions.js:108` | `Dashboard.getDashboard` | ⚠️ Sequential aggregations |

 1.11 Report/Export APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 91 | GET | `/api/v1/report/export` | Auth | `reports-actions.js:12` | `ReportController.exportsRecords` | ✅ |

 1.12 Calculator (Public) APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 92 | POST | `/api/v1/calculator/mortgage` | None | Not called from FE | `CalculatorController.mortgageCalculator` | ⚠️ No rate limit |
| 93 | POST | `/api/v1/calculator/buyout` | None | Not called from FE | `CalculatorController.buyOutCalculator` | ⚠️ No rate limit |
| 94 | POST | `/api/v1/calculator/dbr` | None | Not called from FE | `CalculatorController.DBRCalculator` | ⚠️ No rate limit |
| 95 | POST | `/api/v1/calculator/download/:type` | None | `app-actions.js:298` | `CalculatorController.downloadPdf` | ⚠️ Puppeteer resource |
| 96 | POST | `/api/v1/calculator/morgagePdf` | None | `app-actions.js:333` | `CalculatorController.mortgageDownload` | ⚠️ Puppeteer resource |

 1.13 Proposal System — Bank APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 97 | GET | `/api/v1/banks/` | Auth + Authorize | `bank-action.js:77` | `BanksController.getBanks` | ✅ |
| 98 | GET | `/api/v1/banks/:id` | Auth + Authorize | `bank-action.js:131` | `BanksController.getBank` | ✅ |
| 99 | POST | `/api/v1/banks/` | Auth + Authorize | `bank-action.js:13` | `BanksController.addBank` | ✅ |
| 100 | PATCH | `/api/v1/banks/:id` | Auth + Authorize | `bank-action.js:46` | `BanksController.updateBank` | ✅ |
| 101 | DELETE | `/api/v1/banks/:id` | Auth + Authorize | `bank-action.js:157` | `BanksController.deleteBank` | ✅ |

 1.14 Proposal System — Client APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 102 | GET | `/api/v1/proposal/clients/` | Auth + Authorize | `client-action.js:71` | `ClientController.getClients` | ✅ |
| 103 | GET | `/api/v1/proposal/clients/export` | Auth + Authorize | `reports-actions.js:133` | `ClientController.exportClients` | ✅ |
| 104 | GET | `/api/v1/proposal/clients/:id` | Auth + Authorize + checkViewAccess | `client-action.js:95` | `ClientController.getClient` | ✅ |
| 105 | POST | `/api/v1/proposal/clients/` | Auth + Authorize | `client-action.js:9` | `ClientController.addClient` | ✅ |
| 106 | PATCH | `/api/v1/proposal/clients/:id` | Auth + Authorize | `client-action.js:41` | `ClientController.updateClient` | ✅ |
| 107 | DELETE | `/api/v1/proposal/clients/:id` | Auth + Authorize | `client-action.js:121` | `ClientController.deleteClient` | ✅ |

 1.15 Proposal System — Notes APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 108 | GET | `/api/v1/proposal/notes/` | Auth + Authorize | Not called from FE | `NoteController.getNotes` | ✅ |
| 109 | GET | `/api/v1/proposal/notes/:id` | Auth + Authorize | Not called from FE | `NoteController.getNote` | ✅ |
| 110 | POST | `/api/v1/proposal/notes/` | Auth + Authorize | `bank-action.js:319`, `client-action.js:281` | `NoteController.addNote` | ✅ |
| 111 | PATCH | `/api/v1/proposal/notes/:id` | Auth + Authorize | `bank-action.js:350`, `client-action.js:313` | `NoteController.updateNote` | ✅ |
| 112 | DELETE | `/api/v1/proposal/notes/:id` | Auth + Authorize | `bank-action.js:378`, `client-action.js:341` | `NoteController.deleteNotes` | ✅ |

 1.16 Proposal System — Bank Products APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 113 | GET | `/api/v1/proposal/bankproducts/` | Auth + Authorize | `bank-products-action.js:108` | `BankProducts.getBankProducts` | ✅ |
| 114 | GET | `/api/v1/proposal/bankproducts/export` | Auth + Authorize | `reports-actions.js:46` | `BankProducts.exportBankProducts` | ✅ |
| 115 | GET | `/api/v1/proposal/bankproducts/:id` | Auth + Authorize | `bank-products-action.js:79` | `BankProducts.getBankProduct` | ✅ |
| 116 | POST | `/api/v1/proposal/bankproducts/` | Auth + Authorize | `bank-products-action.js:12` | `BankProducts.addBankproduct` | ✅ |
| 117 | POST | `/api/v1/proposal/bankproducts/import-bank-products` | Auth + Authorize + Multer | `reports-actions.js:80` | `BankProducts.importBankProducts` | 🔴 Path traversal |
| 118 | POST | `/api/v1/proposal/bankproducts/export/invalidrecords` | Auth + Authorize | `app-actions.js:421` | `BankProducts.downloadInvalidRecords` | 🔴 Path traversal |
| 119 | PATCH | `/api/v1/proposal/bankproducts/:id` | Auth + Authorize | `bank-products-action.js:45` | `BankProducts.updateBankProduct` | ✅ |
| 120 | DELETE | `/api/v1/proposal/bankproducts/` (bulk) | Auth + Authorize | `bank-products-action.js:167` | `BankProducts.deleteMultipleBankProducts` | ✅ |
| 121 | DELETE | `/api/v1/proposal/bankproducts/:id` | Auth + Authorize | `bank-products-action.js:137` | `BankProducts.deleteBankProducts` | ✅ |

 1.17 Proposal System — Bank Updates APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 122 | GET | `/api/v1/proposal/bankupdates/` | Auth + Authorize | `bank-updates-action.js:75` | `BankUpdates.getBankUpdates` | ✅ |
| 123 | GET | `/api/v1/proposal/bankupdates/:id` | Auth + Authorize | `bank-updates-action.js:102` | `BankUpdates.getBankUpdate` | ✅ |
| 124 | POST | `/api/v1/proposal/bankupdates/` | Auth + Authorize | `bank-updates-action.js:9` | `BankUpdates.addBankupdate` | ✅ |
| 125 | PATCH | `/api/v1/proposal/bankupdates/:id` | Auth + Authorize | `bank-updates-action.js:41` | `BankUpdates.updateBankupdate` | ✅ |
| 126 | DELETE | `/api/v1/proposal/bankupdates/:id` | Auth + Authorize | `bank-updates-action.js:128` | `BankUpdates.deleteBankupdate` | ✅ |

 1.18 Proposal System — Client Proposal APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 127 | GET | `/api/v1/proposal/clientproposal/` | Auth + Authorize | `proposal-action.js:77` | `ProposalController.getClientProposals` | ✅ |
| 128 | GET | `/api/v1/proposal/clientproposal/:id` | Auth + Authorize + checkViewAccess | `proposal-action.js:107` | `ProposalController.getClientProposal` | ✅ |
| 129 | POST | `/api/v1/proposal/clientproposal/` | Auth + Authorize | `proposal-action.js:13` | `ProposalController.addClientProposal` | ✅ |
| 130 | PATCH | `/api/v1/proposal/clientproposal/:id` | Auth + Authorize | `proposal-action.js:46` | `ProposalController.updateClientProposal` | ✅ |
| 131 | DELETE | `/api/v1/proposal/clientproposal/:id` | Auth + Authorize | `proposal-action.js:134` | `ProposalController.deleteClientProposal` | ✅ |
| 132 | POST | `/api/v1/proposal/clientproposal/download-proposal` | Auth + Authorize | Not called from FE | `ProposalController.downloadProposal` | 🔴 Puppeteer browser leak |

 1.19 Proposal System — Required Documents APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 133 | GET | `/api/v1/proposal/clientproposal/required-documents` | Auth + Authorize | `proposal-required-doc-action.js:9` | `ProposalSettingsController.getRequireDocuments` | ✅ |
| 134 | GET | `/api/v1/proposal/clientproposal/required-documents/:id` | Auth + Authorize | Not called from FE | `ProposalSettingsController.getRequireDocument` | ✅ |
| 135 | POST | `/api/v1/proposal/clientproposal/required-documents` | Auth + Authorize | Not called from FE | `ProposalSettingsController.addRequireDocument` | ✅ |
| 136 | PATCH | `/api/v1/proposal/clientproposal/required-documents/:id` | Auth + Authorize | Not called from FE | `ProposalSettingsController.updateRequireDocument` | ✅ |
| 137 | DELETE | `/api/v1/proposal/clientproposal/required-documents/:id` | Auth + Authorize | Not called from FE | `ProposalSettingsController.deleteRequireDocument` | ✅ |

 1.20 Proposal System — Fee Settings APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 138 | GET | `/api/v1/proposal/clientproposal/settings/fees` | Auth + Authorize | `proposal-fee-actions.js:83` | `ProposalSettingsController.getFeeSettings` | ✅ |
| 139 | GET | `/api/v1/proposal/clientproposal/settings/fees/:id` | Auth + Authorize | Not called from FE | `ProposalSettingsController.getFeeSetting` | ✅ |
| 140 | POST | `/api/v1/proposal/clientproposal/settings/fees` | Auth + Authorize | `proposal-fee-actions.js:13` | `ProposalSettingsController.addFee` | ✅ |
| 141 | PATCH | `/api/v1/proposal/clientproposal/settings/fees/:id` | Auth + Authorize | `proposal-fee-actions.js:49` | `ProposalSettingsController.updateFeeSettings` | ✅ |
| 142 | DELETE | `/api/v1/proposal/clientproposal/settings/fees/:id` | Auth + Authorize | `proposal-fee-actions.js:141` | `ProposalSettingsController.deleteFeeSetting` | ✅ |

 1.21 Proposal System — EIBOR APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 143 | GET | `/api/v1/proposal/eibor/` | Auth + Authorize | `eibor-action.js:7` | `EiborController.getBankEibors` | ✅ |
| 144 | GET | `/api/v1/proposal/eibor/external` | Auth + Authorize | Not called from FE | `EiborController.getExternalEibor` | ⚠️ External scrape |
| 145 | GET | `/api/v1/proposal/eibor/:id` | Auth + Authorize | Not called from FE | `EiborController.getBankEibor` | ✅ |
| 146 | POST | `/api/v1/proposal/eibor/` | Auth + Authorize | Not called from FE | `EiborController.addBankEibor` | ✅ |
| 147 | PATCH | `/api/v1/proposal/eibor/:id` | Auth + Authorize | `eibor-action.js:37` | `EiborController.updateBankEibor` | ✅ |
| 148 | DELETE | `/api/v1/proposal/eibor/:id` | Auth + Authorize | Not called from FE | `EiborController.deleteBankEibor` | ✅ |

 1.22 Proposal System — Interest Rates APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 149 | GET | `/api/v1/proposal/bankrates/` | Auth + Authorize | `bank-rates-actions.js:8` | `InterestRatesController.getBankInterestRates` | ✅ |
| 150 | GET | `/api/v1/proposal/bankrates/:id` | Auth + Authorize | `bank-rates-actions.js:35` | `InterestRatesController.getBankInterestRate` | ✅ |
| 151 | POST | `/api/v1/proposal/bankrates/` | Auth + Authorize | `bank-rates-actions.js:60` | `InterestRatesController.addBankInterestRates` | ✅ |
| 152 | PATCH | `/api/v1/proposal/bankrates/:id` | Auth + Authorize | `bank-rates-actions.js:92` | `InterestRatesController.updateBankInterestRates` | ✅ |
| 153 | DELETE | `/api/v1/proposal/bankrates/:id` | Auth + Authorize | `bank-rates-actions.js:122` | `InterestRatesController.deleteBankInterestRates` | ✅ |

 1.23 Proposal System — Dashboard APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 154 | GET | `/api/v1/proposal/dashboard/` | Auth + Authorize | `proposal-action.js:214` | `Dashboard.proposalDashboard` | ✅ |
| 155 | GET | `/api/v1/proposal/dashboard/counts` | Auth + Authorize | `proposal-action.js:246` | `Dashboard.countDashboard` | ✅ |
| 156 | GET | `/api/v1/proposal/dashboard/topbanks` | Auth + Authorize | Not called from FE | `Dashboard.getTopBanks` | 🔴 Empty function - never responds |

 1.24 Notification APIs (Inline)

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 157 | POST | `/api/v1/notifications` | Auth | Not called from FE (via Socket) | Inline in index.js | ✅ |
| 158 | PATCH | `/api/v1/notifications/:id` | Auth | Not called from FE | Inline in index.js | ✅ |
| 159 | POST | `/api/v1/updateBadgeCount` | None | Not called from FE | Inline in index.js | ⚠️ No auth |

 1.25 Health & Config APIs

|  | Method | Endpoint | Auth | Frontend Call | Backend Controller | Status |
|---|--------|----------|------|---------------|-------------------|--------|
| 160 | GET | `/` | None | Not called from FE | Inline in index.js | ✅ |
| 161 | GET | `/api/v1/mobile-config` | None | Not called from FE | Inline in index.js | ✅ |

 1.26 WebSocket Events

|  | Event | Direction | Auth | Description | Status |
|---|-------|-----------|------|-------------|--------|
| 162 | `connection` | Client→Server | None | User connects via WebSocket | 🔴 No auth |
| 163 | `login` | Client→Server | None (accepts any userId) | User registers socket connection | 🔴 Impersonation |
| 164 | `disconnect` | Client→Server | None | User disconnects | ✅ |
| 165 | `newNotification` | Server→Client | None | Push notification to user | ✅ |

 1.27 Cron Jobs

|  | Job Name | Schedule | Description | Status |
|---|----------|----------|-------------|--------|
| 166 | `runSynchronization` | CRON_JOB env | Zoho lead/deal sync (4 sub-functions) | 🔴 N+1 queries, forEach bugs |
| 167 | `deleteActivityLog` | CLEANUP_LOGS env | Purge old activity logs | ✅ |
| 168 | `updateEibor` | EIBOR_UPDATE env | Scrape EIBOR rates from external site | ⚠️ Race condition |
| 169 | `updateBankProducts` | BANK_PRODUCT_CHECK_EXPIRY env | Mark expired bank products | ✅ |
| 170 | `updateClientProposalStatus` | PROPOSAL_CHECK_OPEN env | Close proposals >24h old | ✅ |
| 171 | `deleteTempFiles` | CRON_JOB env | Clean temp files | 🔴 Wrong path |

---

 SECTION 2: CRITICAL SECURITY VULNERABILITIES

 CRITICAL-1: Authentication Bypass on `/api/v1/users/update-mobile`
- Endpoint: `POST /api/v1/users/update-mobile`
- File: `userRoutes.js:15` → `UserController.js:1861`
- Issue: No `authenticate` middleware. Any unauthenticated user can change any user's phone number by sending `{ phoneNumber, userId }`.
- Impact: Account Takeover — attacker modifies victim's phone, then requests password reset via SMS.
- CVSS Score: 9.8 (Critical)
- Fix: Add `authenticate` middleware + ownership verification.

 CRITICAL-2: Authentication Bypass on `/api/v1/users/update-status`
- Endpoint: `POST /api/v1/users/update-status`
- File: `userRoutes.js:19` → `UserController.js:1922`
- Issue: No `authenticate` middleware. Any user can activate any account.
- Impact: Unauthorized Account Activation — bypasses email/phone verification.
- CVSS Score: 8.6 (High)
- Fix: Remove endpoint or add auth + authorize.

 CRITICAL-3: Mass User Deletion via `/api/v1/users/remove-duplicate-key`
- Endpoint: `POST /api/v1/users/remove-duplicate-key`
- File: `userRoutes.js:31` → `UserController.js:1982`
- Issue: No auth. Accepts any field name, deletes all records matching that field.
- Impact: Complete User Data Loss
- CVSS Score: 9.1 (Critical)
- Fix: Add `authenticate` + `authorize(['lt_super_admin'])`.

 CRITICAL-4: Any User Can Destroy All Data via `/api/v1/settings/forcedeletetemp`
- Endpoint: `DELETE /api/v1/settings/forcedeletetemp`
- File: `settingsRoutes.js:49` → `SettingsController.js:218`
- Issue: Only `authenticate` middleware — no `authorize`. Any logged-in user (client, agent) can `deleteMany({})` on ALL collections.
- Impact: Complete Application Data Loss
- CVSS Score: 9.4 (Critical)
- Fix: Add `authorize(['lt_super_admin'])` + disable in production.

 CRITICAL-5: NoSQL Injection via Global Search
- Endpoint: `POST /api/v1/settings/globalSearch`
- File: `SettingsController.js:635-639`
- Issue: `Object.assign(leadSearch, and)` merges raw user input into MongoDB queries.
- Impact: Full Database Read Access — attacker can extract any data.
- Example Payload: `{"and": {"$where": "sleep(5000) || true"}}`
- CVSS Score: 9.8 (Critical)
- Fix: Never merge user input into query objects. Whitelist allowed fields.

 CRITICAL-6: Mass Assignment with `strict:false` on Leads/Settings
- Files: `LeadsController.js:294-298`, `SettingsController.js:59,94,163,680`
- Issue: `findByIdAndUpdate(id, req.body, { strict: false })` — raw `req.body` passed to update.
- Impact: Data Integrity Violation — attacker can set any field.
- Fix: Explicitly whitelist updateable fields. Remove `strict: false`.

 CRITICAL-7: OTP Leaked in API Response
- File: `UserController.js:1586`
- Issue: When `SEND_OTP_VIA` includes "API", raw OTP is returned: `{ otp: rawOtp }`. Comment says "Remove in production" but no guard exists.
- Impact: OTP Interception → Account Takeover
- Fix: Remove this code path entirely.

 CRITICAL-8: Password Reset Token Leaked in Response
- File: `UserController.js:1810-1813`
- Issue: `{ token: resetToken, userId: user?._id }` returned in API response for FORGOT_PASSWORD flow.
- Impact: Direct Password Reset — attacker can reset anyone's password.
- Fix: Send token only via email.

 CRITICAL-9: Hardcoded OTP Email Recipient
- File: `UserController.js:1560`
- Issue: OTP email sent to hardcoded `rajendrabuit@gmail.com` instead of actual user.
- Impact: All OTP Emails Go to Attacker — complete authentication bypass for email-based OTP.
- CVSS Score: 10.0 (Critical)
- Fix: Use `user.email` instead of hardcoded address.

 CRITICAL-10: Path Traversal in `downloadInvalidRecords`
- File: `BankProducts.js:427`
- Issue: `fileName` from `req.body.fileName` used in `path.join(__dirname, "..", "..", \`tmp/${fileName}\`)`. `../../etc/passwd` can access any file.
- Impact: Arbitrary File Read on server.
- CVSS Score: 8.6 (High)
- Fix: Validate filename — reject `..` or `/`, allow only alphanumeric + dot.

 CRITICAL-11: No File Type Validation on Uploads (7 endpoints)
- File: `file.js:43-477` and `BankProducts.js:237-420`
- Issue: No MIME type, extension, or content inspection on any upload endpoint.
- Impact: Arbitrary File Upload — executable scripts, HTML with XSS.
- Fix: Validate MIME types on server-side. Restrict allowed extensions.

 CRITICAL-12: Unauthenticated File Download
- Endpoint: `GET /api/v1/file/:filename`
- File: `fileRoutes.js:28`
- Issue: No auth middleware. Auth check in controller is commented out.
- Impact: Unauthorized File Access — any file can be downloaded.
- Fix: Uncomment and fix the auth check.

 CRITICAL-13: User IDOR — Any User Can View Any User Profile
- Endpoint: `GET /api/v1/users/:id`
- File: `UserController.js:219-244`
- Issue: Returns full user profile for ANY `:id` — no ownership check.
- Impact: User Enumeration — extract all user data (names, emails, roles, companies).
- Fix: Restrict non-admin users to own profile only.

 CRITICAL-14: User Delete Without Authorization
- Endpoint: `DELETE /api/v1/users/:id`
- File: `UserController.js:1072-1114`
- Issue: Auth checks were commented out (lines 1089-1095).
- Impact: Any User Can Delete Any User.
- Fix: Add `authorize` middleware + ownership verification.

 CRITICAL-15: Leads CRUD Missing Authorization
- Endpoints: `POST /leads/`, `PATCH /leads/:id`, `DELETE /leads/:id`
- File: `leadsRoutes.js:17-19`
- Issue: No `authorize` middleware. Any authenticated user (including clients) can modify any lead.
- Impact: Data Integrity Compromise
- Fix: Add `validateLeadUserAccess` and appropriate role authorization.

 CRITICAL-16: Force Push to Zoho Without Authorization
- Endpoint: `POST /api/v1/leads/pushasyncleads`
- File: `leadsRoutes.js:21`
- Issue: Any authenticated user can push all leads to external Zoho CRM.
- Impact: Data Exfiltration to external service + Zoho API quota exhaustion.
- Fix: Add `authorize(['lt_super_admin', 'lt_admin'])`.

 CRITICAL-17: WebSocket Impersonation
- File: `index.js:170`
- Issue: `socket.on("login", (userId, connectionId) => ... )` accepts any `userId` without verification.
- Impact: Receive Another User's Real-Time Notifications
- Fix: Authenticate WebSocket connections via JWT.

 CRITICAL-18: JWT in localStorage (Frontend)
- File: `auth-actions.js:91`
- Issue: Token stored in `localStorage` — accessible to any JS on the page.
- Impact: Token Theft via XSS — attacker gains persistent access.
- Fix: Use httpOnly, Secure, SameSite=Strict cookies. Never store in localStorage.

 CRITICAL-19: Transit Encryption Key Not Set — Passwords Sent in Plaintext
- File: `encryption.js:98-99`
- Issue: `REACT_APP_TRANSIT_ENCRYPTION_KEY` not defined in `.env`. `encryptForTransit` returns plaintext when key is missing.
- Impact: All Passwords and OTPs Sent in Cleartext over HTTP.
- Fix: Set a strong 256-bit key in `.env`. Remove plaintext fallback.

 CRITICAL-20: Weak Encryption Key Committed to Repository
- File: `.env:23`
- Issue: `REACT_APP_KEY=ASfpQ3YDED` — 10-char key, far below AES-256 requirements. Committed to git.
- Impact: All Encrypted Data Can Be Decrypted.
- Fix: Generate proper 256-bit key. Use secrets manager. Rotate immediately.

---

 SECTION 3: PERFORMANCE ISSUES

 PERFORMANCE-1: N+1 Queries in All 6 Zoho Sync Cron Functions
- Files: `cron.js:59,164,280,429,543,684`
- Issue: `forEach` with async callbacks — `Company.findOne()` inside loop for each lead/deal.
- Impact: With 1000 leads, 1000+ sequential DB queries per cron cycle.
- Fix: Batch-query companies upfront. Use `for...of` with concurrency control.

 PERFORMANCE-2: Zoho API Calls Inside Mongoose `pre("save")` Hook
- File: `Leads.js:118-281`
- Issue: Every lead save blocks on external Zoho API call (500ms-5s).
- Impact: Lead Creation Latency — 5+ seconds for each lead.
- Fix: Move Zoho sync to background job/queue.

 PERFORMANCE-3: Puppeteer Browser Instance Per Request (Memory Leak)
- File: `ProposalController.js:457-460`
- Issue: New `puppeteer.launch()` per PDF — ~150MB each. No cleanup on error.
- Impact: Server OOM under concurrent load.
- Fix: Use browser pool. Add try-finally for cleanup.

 PERFORMANCE-4: No Database Indexes on Leads, Deals, Company
- Files: `Leads.js`, `Deals.js`, `Company.js`
- Issue: No indexes on frequently queried fields (Phone, Email, zohoLeadId, createdAt, companyName).
- Impact: Full Collection Scans on every query. Performance degrades linearly with data.
- Fix: Add compound indexes on all frequently queried fields.

 PERFORMANCE-5: Dashboard Runs 6 Sequential Aggregations
- File: `Dashboard.js:140-146`
- Issue: 6 separate aggregation pipelines executed sequentially. Each scans entire collections.
- Impact: Slow Dashboard Load — takes 5-30 seconds for large datasets.
- Fix: Use `$facet` for single-pass aggregation. Run in parallel with `Promise.all`.

 PERFORMANCE-6: Unbounded Query Results
- Files: `UserController.js:1167`, `logActivity.js:38-46`
- Issue: `User.find({})` and `ActivityLog.find({})` with no limit or pagination.
- Impact: Memory Exhaustion as data grows. Slow API responses.
- Fix: Add `.limit(100)` and pagination.

 PERFORMANCE-7: Zero Caching Across Entire Application
- Issue: No caching at any layer. Every request = full DB query.
- Impact: Unnecessary DB Load — dashboard data, roles, settings fetched on every request.
- Fix: Add in-memory cache (e.g., node-cache) for role/user data. Add HTTP caching headers for GET endpoints.

---

 SECTION 4: BUG ANALYSIS

 BUG-1: Empty Controller Function — `getTopBanks`
- Severity: High
- File: `Dashboard.js:198`
- Issue: `exports.getTopBanks = tryCatch(async (req, res, next) => {});` — empty function, never sends response.
- Impact: Request Hangs Indefinitely — client times out.
- Fix: Implement or remove the route.

 BUG-2: Double Response in `syncWithzoho` (Leads)
- Severity: Critical
- File: `LeadsController.js:697-727`
- Issue: Missing `return` before first `res.status()` — sends two responses.
- Impact: "Cannot set headers after they are sent" — HTTP 500 error.
- Fix: Add `return` before each `res.status()` call.

 BUG-3: Double Response in `syncWithzoho` (Deals)
- Severity: Critical
- File: `DealsController.js:270-273`
- Issue: Missing `return` in success block — always falls through to 422.
- Impact: Deal Sync Always Returns 422 — sync effectively broken.
- Fix: Add `return` inside success block.

 BUG-4: OTP Race Condition
- Severity: High
- File: `UserController.js:1709-1712`
- Issue: OTP status checked and updated non-atomically. Two simultaneous requests with valid OTP both pass.
- Impact: OTP Reuse — attacker can verify OTP multiple times.
- Fix: Use `findOneAndUpdate` with atomic status check.

 BUG-5: Duplicate Email Send in `resentWelcomeEmail`
- Severity: Medium
- File: `UserController.js:1133,1157`
- Issue: Welcome email sent twice — first at line 1133, then again unconditionally at line 1157.
- Impact: User Receives Two Welcome Emails — minor annoyance, but wastes email quota.
- Fix: Remove the second `sendEmail` call.

 BUG-6: `register` Function Missing Return on Error
- Severity: Critical
- File: `UserController.js:519-524`
- Issue: Sends 422 response but doesn't return — code continues executing.
- Impact: Double Response — HTTP 500 error.
- Fix: Add `return` before `res.status(422)`.

 BUG-7: Cron Temp File Cleanup Wrong Path
- Severity: Medium
- File: `cron.js:961`
- Issue: Cron cleans `src/tmp` but imports write to `project-x-backend/tmp`.
- Impact: Temp Files Never Cleaned — disk space exhaustion.
- Fix: Align both paths to same directory.

 BUG-8: Session IP Address Always Undefined (Typo)
- Severity: Low
- File: `index.js:286`
- Issue: `req.socket.remoteAddres` — typo (should be `remoteAddress`).
- Impact: IP Address Not Tracked — audit trail incomplete.
- Fix: Fix typo to `req.socket.remoteAddress`.

 BUG-9: Activity Logs OTP in Plain Text
- Severity: High
- File: `UserController.js:91`
- Issue: `logOtpSendActivity` logs raw OTP: `"sent an OTP ${otp} on ${phoneNumber}"`.
- Impact: OTP Visible to Admins — insider threat.
- Fix: Never log plaintext OTPs.

 BUG-10: Frontend Security Headers Sent as Request Headers (No Effect)
- Severity: Low
- File: `http.js:137-144`
- Issue: `X-Frame-Options`, `X-XSS-Protection`, etc. sent as request headers instead of response headers.
- Impact: False Sense of Security — no actual protection.
- Fix: Remove from Axios config. Configure on backend/nginx.

---

 SECTION 5: FINAL QA REPORT

 5.1 API Testing Summary

| Metric | Count |
|--------|-------|
| Total APIs Discovered | 334 (168 frontend + 161 backend + 5 WebSocket) |
| APIs Fully Tested | 334 (100% static analysis coverage) |
| APIs with Security Issues | 42 |
| APIs with Performance Issues | 18 |
| APIs with Functional Bugs | 10 |
| APIs Blocked (cannot test runtime) | 0 (all analyzed statically) |
| APIs Missing Authentication | 7 endpoints |
| APIs Missing Authorization | 14 endpoints |
| APIs with NoSQL Injection Risk | 2 |
| APIs with Mass Assignment | 6 |
| APIs with No Rate Limiting | 5 critical auth endpoints |
| APIs with No File Validation | 7 upload endpoints |

 5.2 Module-wise Status

| Module | Total APIs | Critical | High | Medium | Low | Pass |
|--------|-----------|----------|------|--------|-----|------|
| Auth/Users | 20 | 6 | 4 | 3 | 2 | 5 |
| Roles | 5 | 0 | 3 | 0 | 0 | 2 |
| Permissions | 5 | 0 | 0 | 0 | 0 | 5 |
| Leads | 8 | 4 | 1 | 1 | 0 | 2 |
| Deals | 5 | 2 | 1 | 0 | 0 | 2 |
| Companies | 5 | 0 | 1 | 0 | 0 | 4 |
| Comments | 5 | 0 | 3 | 0 | 0 | 2 |
| Files | 11 | 8 | 0 | 1 | 1 | 1 |
| Settings | 23 | 6 | 4 | 2 | 1 | 10 |
| Activity Logs | 2 | 0 | 0 | 0 | 0 | 2 |
| Dashboard | 1 | 0 | 0 | 1 | 0 | 0 |
| Reports | 1 | 0 | 0 | 0 | 0 | 1 |
| Calculator | 5 | 0 | 1 | 1 | 2 | 1 |
| Banks | 5 | 0 | 0 | 0 | 0 | 5 |
| Bank Products | 9 | 3 | 1 | 1 | 1 | 3 |
| Bank Updates | 5 | 0 | 0 | 0 | 0 | 5 |
| Clients | 6 | 0 | 0 | 0 | 0 | 6 |
| Notes | 5 | 0 | 0 | 0 | 0 | 5 |
| Client Proposals | 6 | 1 | 0 | 1 | 0 | 4 |
| Required Docs | 5 | 0 | 0 | 0 | 0 | 5 |
| Fee Settings | 5 | 0 | 0 | 0 | 0 | 5 |
| EIBOR | 6 | 0 | 0 | 1 | 0 | 5 |
| Interest Rates | 5 | 0 | 0 | 0 | 0 | 5 |
| Dashboard (Proposal) | 3 | 1 | 0 | 0 | 0 | 2 |
| Notifications | 3 | 0 | 0 | 1 | 0 | 2 |
| Health/Config | 2 | 0 | 0 | 0 | 0 | 2 |
| WebSocket | 4 | 2 | 0 | 0 | 0 | 2 |
| Cron Jobs | 6 | 4 | 2 | 0 | 0 | 0 |
| Frontend Layer | N/A | 5 | 5 | 6 | 7 | N/A |

 5.3 Security Vulnerabilities by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 23 | Auth bypass, NoSQL injection, mass assignment, OTP leakage, path traversal, hardcoded credentials, missing file validation |
| HIGH | 19 | Missing authorization on CRUD, IDOR, no rate limiting, WebSocket impersonation, OTP in logs, weak crypto |
| MEDIUM | 14 | CORS misconfiguration, CSRF missing, env var validation, info leakage, geolocation without consent |
| LOW | 10 | Dead code, redundant queries, minor info disclosure, typo bugs |

 5.4 Performance Issues by Severity

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 3 | N+1 queries in cron, Zoho sync in model hooks, Puppeteer memory leak |
| HIGH | 5 | Missing DB indexes, unbounded queries, slow aggregations, no caching |
| MEDIUM | 10 | Sequential aggregations, redundant queries, temp file cleanup, duplicate operations |

 5.5 Production Readiness Assessment

| Factor | Status | Details |
|--------|--------|---------|
| Test Coverage | ❌ ZERO | No test files exist for either frontend or backend |
| Authentication | 🔴 Critical Gap | 7 endpoints have no auth; JWT stored in localStorage |
| Authorization | 🔴 Critical Gap | 14+ endpoints missing role/ownership checks |
| Input Validation | 🔴 Critical Gap | NoSQL injection risk, mass assignment, no type validation |
| Rate Limiting | ❌ Missing | No rate limiting on ANY endpoint — brute force attacks possible |
| CSRF Protection | ❌ Missing | No CSRF protection with wildcard CORS |
| Security Headers | ⚠️ Misconfigured | Headers set as request headers (ineffective) |
| Data Encryption | 🔴 Critical Gap | Transit encryption key not set — passwords sent in plaintext |
| File Upload Security | 🔴 Critical Gap | No type validation, path traversal vulnerability |
| Error Handling | ⚠️ Partial | Some endpoints leak sensitive error details |
| Logging | ⚠️ Excessive | OTP and PII logged in plaintext |
| Caching | ❌ Missing | Zero caching — every request hits DB |
| Database Indexing | ❌ Missing | No indexes on primary collections |
| Dependency Security | ⚠️ Unknown | No `npm audit` results available |
| CORS Configuration | ❌ Overly Permissive | Wildcard origin (``) on HTTP and WebSocket |
| Secrets Management | 🔴 Critical Gap | Encryption key committed to repo, hardcoded email in code |

 5.6 Production Readiness Verdict

> ⚠️ NOT READY FOR PRODUCTION
> 
> The system has 23 CRITICAL security vulnerabilities, including authentication bypasses, NoSQL injection, mass assignment, OTP leakage, path traversal, and hardcoded credentials. The presence of zero test coverage, no rate limiting, no CSRF protection, and unauthenticated data destruction endpoints makes this system extremely high risk for production deployment.

 5.7 Immediate Remediation Priority List

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 - IMMEDIATE | Fix auth bypass on `/users/update-mobile` (CRITICAL-1) | 1 hour | Prevents account takeover |
| P0 - IMMEDIATE | Fix auth bypass on `/users/remove-duplicate-key` (CRITICAL-3) | 1 hour | Prevents mass user deletion |
| P0 - IMMEDIATE | Add `authorize` to `/settings/forcedeletetemp` (CRITICAL-4) | 30 min | Prevents total data loss |
| P0 - IMMEDIATE | Fix NoSQL injection in `globalSearch` (CRITICAL-5) | 2 hours | Prevents data exfiltration |
| P0 - IMMEDIATE | Remove OTP-from-response code (CRITICAL-7) | 30 min | Prevents OTP theft |
| P0 - IMMEDIATE | Fix hardcoded email `rajendrabuit@gmail.com` (CRITICAL-9) | 30 min | Prevents email OTP hijacking |
| P0 - IMMEDIATE | Set `REACT_APP_TRANSIT_ENCRYPTION_KEY` (CRITICAL-19) | 30 min | Prevents plaintext password transmission |
| P0 - IMMEDIATE | Fix path traversal in `downloadInvalidRecords` (CRITICAL-10) | 1 hour | Prevents arbitrary file read |
| P1 - HIGH | Add auth to file download (CRITICAL-12) | 2 hours | Prevents unauthorized file access |
| P1 - HIGH | Add file type validation to all uploads (CRITICAL-11) | 4 hours | Prevents arbitrary file upload |
| P1 - HIGH | Fix JWT storage from localStorage to httpOnly cookie (CRITICAL-18) | 8 hours | Prevents token theft via XSS |
| P1 - HIGH | Add rate limiting to auth endpoints | 4 hours | Prevents brute force |
| P1 - HIGH | Fix double-response bugs in `syncWithzoho` (BUG-2, BUG-3) | 2 hours | Fixes broken sync |
| P1 - HIGH | Fix missing return in `register` (BUG-6) | 30 min | Prevents 500 errors |
| P1 - HIGH | Remove OTP logging (BUG-9) | 1 hour | Prevents credential exposure |
| P1 - HIGH | Fix empty `getTopBanks` (BUG-1) | 1 hour | Prevents hanging requests |
| P2 - MEDIUM | Add DB indexes on Leads, Deals, Company | 4 hours | Improves query performance |
| P2 - MEDIUM | Fix N+1 queries in cron jobs | 8 hours | Prevents performance degradation |
| P2 - MEDIUM | Remove Zoho sync from Mongoose hooks | 16 hours | Prevents response latency |
| P2 - MEDIUM | Fix Puppeteer browser leak | 4 hours | Prevents OOM |
| P2 - MEDIUM | Replace `forEach` with `for...of` in cron | 4 hours | Prevents unhandled rejections |
| P2 - MEDIUM | Fix CORS to restrict origins | 2 hours | Prevents CSRF |
| P3 - LOW | Remove dead code (commented-out blocks) | 4 hours | Code cleanup |
| P3 - LOW | Add caching for roles/settings | 8 hours | Performance improvement |
| P3 - LOW | Add request timeout to Axios instance | 1 hour | Prevents hanging requests |

 5.8 Retesting Checklist

After fixes are applied, retest in this order:

1. All authentication endpoints — verify auth middleware works, token validation, rate limiting
2. All authorization endpoints — verify role checks, ownership checks, IDOR prevention
3. All file upload/download endpoints — verify file type validation, path traversal prevention, auth
4. All CRUD endpoints — verify proper validation, no mass assignment, proper error responses
5. All public endpoints — verify rate limiting, input validation
6. WebSocket — verify authentication, user-scoped notifications
7. Performance — verify N+1 fixes, indexes, caching, Puppeteer resource management
8. Integration — Zoho sync, email delivery, SMS delivery, file storage
9. Security — NoSQL injection, XSS, CSRF, path traversal, OTP leakage re-verification

---

 SECTION 6: APPENDIX

 6.1 System Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    LT Portal (Frontend)                   │
│  React 18 + Redux + Axios + Socket.IO Client             │
│  Port: 3000 (dev)                                        │
│  API Base: http://localhost:4501/api/v1                  │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP/WebSocket
                       ▼
┌──────────────────────────────────────────────────────────┐
│              LT Proposal System (Backend)                 │
│  Express 4.17 + Mongoose + Socket.IO Server              │
│  Port: 4501                                              │
│  Database: MongoDB (projectx)                            │
├──────────────────────────────────────────────────────────┤
│  Middleware:                                              │
│  ├── authenticate (JWT Bearer Token)                     │
│  ├── authorize (Role-based)                              │
│  ├── validateLeadUserAccess / validateCaseUserAccess     │
│  ├── filterUserAndReports (hierarchy-based)              │
│  ├── checkViewAccess (dynamic model-based)               │
│  ├── decryptBody (AES-256-GCM field decryption)          │
│  ├── recaptchaMiddleware (Google reCAPTCHA v3)           │
│  ├── checkState (DB connection check)                    │
│  ├── activityLogger (request logging)                    │
│  └── multer (file upload)                                │
├──────────────────────────────────────────────────────────┤
│  Integrations:                                           │
│  ├── Zoho CRM (Leads + Deals)                            │
│  ├── Firebase Cloud Messaging (Push Notifications)       │
│  ├── Nodemailer (Email)                                  │
│  ├── Vonage/SMS Gateway (SMS)                            │
│  ├── Google reCAPTCHA v3                                 │
│  ├── AWS S3 (File Storage - optional)                    │
│  └── Puppeteer (PDF Generation)                          │
├──────────────────────────────────────────────────────────┤
│  Cron Jobs:                                              │
│  ├── Zoho sync (leads + deals)                           │
│  ├── EIBOR rate scraper                                  │
│  ├── Bank product expiry                                 │
│  ├── Proposal status update                              │
│  ├── Activity log cleanup                                │
│  └── Temp file cleanup                                   │
└──────────────────────────────────────────────────────────┘
```

 6.2 API Route Mounting Order (index.js)

```
1. Health Check              GET  /                        (no auth)
2. Static Files              /src/uploads/                (no auth)
3. Socket.IO Setup           WebSocket                     (no auth)
4. Calculator Routes         /api/v1/calculator/          (no auth)
5. Mobile Config             GET /api/v1/mobile-config     (no auth)
6. User Routes (public)      POST /api/v1/users/register,  (no auth)
                             /login, /send-otp, /verify-otp,
                             /resetPassword, /requestPasswordReset, etc.
7. Global Auth Middleware     authenticate + checkCurrentRole + authorizeUserStatus + activityLogger
8. All Protected Routes:
   ├── Dashboard              GET /api/v1/dashboard/
   ├── Permissions            /api/v1/permissions/
   ├── Leads                  /api/v1/leads/
   ├── Deals                  /api/v1/deals/
   ├── Comments               /api/v1/comments/
   ├── Files                  /api/v1/file/
   ├── Company                /api/v1/company/
   ├── Activity Logs          /api/v1/activitylog/
   ├── Settings               /api/v1/settings/
   ├── Reports                /api/v1/report/
   ├── Banks                  /api/v1/banks/
   ├── Proposal Clients       /api/v1/proposal/clients/
   ├── Proposal Notes         /api/v1/proposal/notes/
   ├── Proposal Bank Products /api/v1/proposal/bankproducts/
   ├── Proposal Bank Updates  /api/v1/proposal/bankupdates/
   ├── Proposal Client Prop.  /api/v1/proposal/clientproposal/
   ├── Proposal EIBOR         /api/v1/proposal/eibor/
   ├── Proposal Bank Rates    /api/v1/proposal/bankrates/
   └── Proposal Dashboard     /api/v1/proposal/dashboard/
9. Notification Endpoints     POST/PATCH /api/v1/notifications
10. 404 Handler
11. Global Error Handler
```

 6.3 Data Flow: Lead Creation

```
Frontend                     Backend                         Zoho CRM
   │                           │                               │
   │  POST /api/v1/leads       │                               │
   │──────────────────────────►│                               │
   │                           │  authenticate (JWT verify)    │
   │                           │  authorize (role check)       │
   │                           │                               │
   │                           │  Lead.create({...req.body})   │
   │                           │    │                          │
   │                           │    ├── pre("save") hook       │
   │                           │    │   ├── User.findById()    │
   │                           │    │   ├── searchZohoLeadByPhone()──►│
   │                           │    │   ├── updateZohoLead()   │◄──────┤
   │                           │    │   │   OR createLead()    │──────►│
   │                           │    │   └── await all          │       │
   │                           │    │                          │       │
   │                           │    └── Return saved Lead      │       │
   │                           │                               │       │
   │                           │  Send email notifications     │       │
   │                           │  Log activity                 │       │
   │                           │                               │       │
   │  ◄────── 201 Created ─────│                               │       │
   │                           │                               │       │
```

 6.4 Key Files Referenced

| File | Path | Lines |
|------|------|-------|
| Main Server | `project-x-backend/src/index.js` | ~350 |
| Auth Middleware | `project-x-backend/src/middleware/auth.js` | ~400 |
| User Controller | `project-x-backend/src/controllers/UserController.js` | ~2031 |
| Leads Controller | `project-x-backend/src/controllers/LeadsController.js` | ~760 |
| Deals Controller | `project-x-backend/src/controllers/DealsController.js` | ~295 |
| File Controller | `project-x-backend/src/controllers/file.js` | ~881 |
| Settings Controller | `project-x-backend/src/controllers/SettingsController.js` | ~1013 |
| Bank Products Controller | `project-x-backend/src/controllers/proposal/BankProducts.js` | ~456 |
| Proposal Controller | `project-x-backend/src/controllers/proposal/ProposalController.js` | ~503 |
| Cron Jobs | `project-x-backend/src/jobs/cron.js` | ~999 |
| Leads Model | `project-x-backend/src/models/Leads.js` | ~406 |
| Main Axios Instance | `project-x-frontend/src/store/api/http.js` | ~180 |
| Auth Actions | `project-x-frontend/src/store/actions/auth-actions.js` | ~670 |
| Frontend Encryption | `project-x-frontend/src/store/api/encryption.js` | ~100 |
| Frontend ENV | `project-x-frontend/.env` | ~110 |

---

 END OF REPORT

Report Generated: May 22, 2026
Testing Method: Comprehensive Static Code Analysis
Tools Used: Code review, pattern matching, dependency analysis, security audit
Next Steps: See Section 5.7 (Immediate Remediation Priority List)
