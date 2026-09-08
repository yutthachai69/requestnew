BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] INT NOT NULL IDENTITY(1,1),
    [username] NVARCHAR(255) NOT NULL,
    [password] NVARCHAR(1000) NOT NULL,
    [fullName] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [position] NVARCHAR(1000),
    [phoneNumber] NVARCHAR(1000),
    [signatureUrl] NVARCHAR(max),
    [isActive] BIT NOT NULL CONSTRAINT [User_isActive_df] DEFAULT 1,
    [roleId] INT NOT NULL,
    [departmentId] INT,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_username_key] UNIQUE NONCLUSTERED ([username])
);

-- CreateTable
CREATE TABLE [dbo].[Role] (
    [id] INT NOT NULL IDENTITY(1,1),
    [roleName] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(1000),
    [allowBulkActions] BIT NOT NULL CONSTRAINT [Role_allowBulkActions_df] DEFAULT 0,
    CONSTRAINT [Role_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Role_roleName_key] UNIQUE NONCLUSTERED ([roleName])
);

-- CreateTable
CREATE TABLE [dbo].[Status] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(255) NOT NULL,
    [displayName] NVARCHAR(1000) NOT NULL,
    [colorCode] NVARCHAR(1000) NOT NULL CONSTRAINT [Status_colorCode_df] DEFAULT '#6b7280',
    [displayOrder] INT NOT NULL CONSTRAINT [Status_displayOrder_df] DEFAULT 0,
    [isInitialState] BIT NOT NULL CONSTRAINT [Status_isInitialState_df] DEFAULT 0,
    CONSTRAINT [Status_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Status_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Action] (
    [id] INT NOT NULL IDENTITY(1,1),
    [actionName] NVARCHAR(255) NOT NULL,
    [displayName] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [Action_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Action_actionName_key] UNIQUE NONCLUSTERED ([actionName])
);

-- CreateTable
CREATE TABLE [dbo].[Department] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(255) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [Department_isActive_df] DEFAULT 1,
    CONSTRAINT [Department_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Department_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Location] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(255) NOT NULL,
    CONSTRAINT [Location_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Location_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Category] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(255) NOT NULL,
    [requiresCCSClosing] BIT NOT NULL CONSTRAINT [Category_requiresCCSClosing_df] DEFAULT 0,
    [isWorkflowTemplate] BIT NOT NULL CONSTRAINT [Category_isWorkflowTemplate_df] DEFAULT 0,
    CONSTRAINT [Category_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Category_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[CorrectionReason] (
    [id] INT NOT NULL IDENTITY(1,1),
    [text] NVARCHAR(max) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [CorrectionReason_isActive_df] DEFAULT 1,
    CONSTRAINT [CorrectionReason_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CorrectionType] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(255) NOT NULL,
    [displayOrder] INT NOT NULL CONSTRAINT [CorrectionType_displayOrder_df] DEFAULT 10,
    [isActive] BIT NOT NULL CONSTRAINT [CorrectionType_isActive_df] DEFAULT 1,
    [templateString] NVARCHAR(max),
    [fieldsConfig] NVARCHAR(max),
    CONSTRAINT [CorrectionType_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CorrectionType_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[WorkflowVersion] (
    [id] INT NOT NULL IDENTITY(1,1),
    [categoryId] INT NOT NULL,
    [correctionTypeId] INT,
    [versionNumber] INT NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [WorkflowVersion_status_df] DEFAULT 'DRAFT',
    [label] NVARCHAR(255),
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WorkflowVersion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [publishedAt] DATETIME2,
    CONSTRAINT [WorkflowVersion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[WorkflowTransition] (
    [id] INT NOT NULL IDENTITY(1,1),
    [workflowVersionId] INT,
    [categoryId] INT NOT NULL,
    [correctionTypeId] INT,
    [currentStatusId] INT NOT NULL,
    [actionId] INT NOT NULL,
    [requiredRoleId] INT NOT NULL,
    [nextStatusId] INT NOT NULL,
    [stepSequence] INT NOT NULL,
    [filterByDepartment] BIT NOT NULL CONSTRAINT [WorkflowTransition_filterByDepartment_df] DEFAULT 0,
    [conditionKey] NVARCHAR(64) NOT NULL CONSTRAINT [WorkflowTransition_conditionKey_df] DEFAULT 'ALWAYS',
    CONSTRAINT [WorkflowTransition_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[WorkflowStep] (
    [id] INT NOT NULL IDENTITY(1,1),
    [stepSequence] INT NOT NULL,
    [approverRoleName] NVARCHAR(1000) NOT NULL,
    [filterByDepartment] BIT NOT NULL CONSTRAINT [WorkflowStep_filterByDepartment_df] DEFAULT 0,
    [categoryId] INT NOT NULL,
    CONSTRAINT [WorkflowStep_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SpecialApproverMapping] (
    [id] INT NOT NULL IDENTITY(1,1),
    [categoryId] INT NOT NULL,
    [stepSequence] INT NOT NULL,
    [userId] INT NOT NULL,
    CONSTRAINT [SpecialApproverMapping_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SpecialApproverMapping_categoryId_stepSequence_key] UNIQUE NONCLUSTERED ([categoryId],[stepSequence])
);

-- CreateTable
CREATE TABLE [dbo].[DocConfig] (
    [id] INT NOT NULL IDENTITY(1,1),
    [year] INT NOT NULL,
    [prefix] NVARCHAR(1000) NOT NULL,
    [lastRunningNumber] INT NOT NULL CONSTRAINT [DocConfig_lastRunningNumber_df] DEFAULT 0,
    [categoryId] INT NOT NULL,
    CONSTRAINT [DocConfig_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DocConfig_categoryId_year_key] UNIQUE NONCLUSTERED ([categoryId],[year])
);

-- CreateTable
CREATE TABLE [dbo].[EmailTemplate] (
    [id] INT NOT NULL IDENTITY(1,1),
    [templateName] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(1000),
    [subject] NVARCHAR(1000) NOT NULL,
    [body] NVARCHAR(max) NOT NULL CONSTRAINT [EmailTemplate_body_df] DEFAULT '',
    [placeholders] NVARCHAR(max) NOT NULL CONSTRAINT [EmailTemplate_placeholders_df] DEFAULT '',
    CONSTRAINT [EmailTemplate_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EmailTemplate_templateName_key] UNIQUE NONCLUSTERED ([templateName])
);

-- CreateTable
CREATE TABLE [dbo].[ITRequestF07] (
    [id] INT NOT NULL IDENTITY(1,1),
    [workOrderNo] NVARCHAR(255),
    [thaiName] NVARCHAR(1000) NOT NULL,
    [phone] NVARCHAR(1000),
    [problemDetail] NVARCHAR(max) NOT NULL,
    [systemType] NVARCHAR(1000) NOT NULL,
    [isMoneyRelated] BIT NOT NULL CONSTRAINT [ITRequestF07_isMoneyRelated_df] DEFAULT 0,
    [requiresAccountRecheck] BIT NOT NULL CONSTRAINT [ITRequestF07_requiresAccountRecheck_df] DEFAULT 0,
    [attachmentPath] NVARCHAR(1000),
    [status] NVARCHAR(1000) CONSTRAINT [ITRequestF07_status_df] DEFAULT 'PENDING',
    [currentStatusId] INT NOT NULL CONSTRAINT [ITRequestF07_currentStatusId_df] DEFAULT 1,
    [currentApprovalStep] INT NOT NULL CONSTRAINT [ITRequestF07_currentApprovalStep_df] DEFAULT 1,
    [approvalRound] INT NOT NULL CONSTRAINT [ITRequestF07_approvalRound_df] DEFAULT 1,
    [approvalToken] NVARCHAR(255),
    [reasonText] NVARCHAR(max),
    [problemReason] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ITRequestF07_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [requesterId] INT NOT NULL,
    [departmentId] INT NOT NULL,
    [locationId] INT NOT NULL,
    [categoryId] INT NOT NULL,
    [workflowVersionId] INT,
    CONSTRAINT [ITRequestF07_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RequestCorrectionType] (
    [requestId] INT NOT NULL,
    [correctionTypeId] INT NOT NULL,
    CONSTRAINT [RequestCorrectionType_pkey] PRIMARY KEY CLUSTERED ([requestId],[correctionTypeId])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [timestamp] DATETIME2 NOT NULL CONSTRAINT [AuditLog_timestamp_df] DEFAULT CURRENT_TIMESTAMP,
    [action] NVARCHAR(1000) NOT NULL,
    [userId] INT,
    [ipAddress] NVARCHAR(1000),
    [detail] NVARCHAR(max),
    [requestId] INT,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ApprovalHistory] (
    [id] INT NOT NULL IDENTITY(1,1),
    [requestId] INT NOT NULL,
    [approverId] INT NOT NULL,
    [approvalLevel] DECIMAL(32,16) NOT NULL CONSTRAINT [ApprovalHistory_approvalLevel_df] DEFAULT 0,
    [approvalRound] INT NOT NULL CONSTRAINT [ApprovalHistory_approvalRound_df] DEFAULT 1,
    [actionType] NVARCHAR(1000) NOT NULL,
    [comment] NVARCHAR(max),
    [approvalTimestamp] DATETIME2 NOT NULL CONSTRAINT [ApprovalHistory_approvalTimestamp_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ApprovalHistory_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Notification] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [requestId] INT,
    [message] NVARCHAR(max) NOT NULL,
    [isRead] BIT NOT NULL CONSTRAINT [Notification_isRead_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Notification_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Notification_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[_CategoryToCorrectionType] (
    [A] INT NOT NULL,
    [B] INT NOT NULL,
    CONSTRAINT [_CategoryToCorrectionType_AB_unique] UNIQUE NONCLUSTERED ([A],[B])
);

-- CreateTable
CREATE TABLE [dbo].[_CategoryToLocation] (
    [A] INT NOT NULL,
    [B] INT NOT NULL,
    CONSTRAINT [_CategoryToLocation_AB_unique] UNIQUE NONCLUSTERED ([A],[B])
);

-- CreateTable
CREATE TABLE [dbo].[_CategoryToUser] (
    [A] INT NOT NULL,
    [B] INT NOT NULL,
    CONSTRAINT [_CategoryToUser_AB_unique] UNIQUE NONCLUSTERED ([A],[B])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkflowVersion_scope_status_idx] ON [dbo].[WorkflowVersion]([categoryId], [correctionTypeId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkflowTransition_workflowVersion_idx] ON [dbo].[WorkflowTransition]([workflowVersionId], [currentStatusId], [conditionKey]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ITRequestF07_workflowVersion_idx] ON [dbo].[ITRequestF07]([workflowVersionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ITRequestF07_categoryId_idx] ON [dbo].[ITRequestF07]([categoryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ITRequestF07_createdAt_idx] ON [dbo].[ITRequestF07]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ITRequestF07_currentStatusId_idx] ON [dbo].[ITRequestF07]([currentStatusId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ITRequestF07_departmentId_idx] ON [dbo].[ITRequestF07]([departmentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ITRequestF07_requesterId_idx] ON [dbo].[ITRequestF07]([requesterId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ITRequestF07_status_idx] ON [dbo].[ITRequestF07]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_requestId_idx] ON [dbo].[AuditLog]([requestId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_timestamp_idx] ON [dbo].[AuditLog]([timestamp]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_userId_idx] ON [dbo].[AuditLog]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ApprovalHistory_requestId_approvalLevel_idx] ON [dbo].[ApprovalHistory]([requestId], [approvalLevel]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ApprovalHistory_request_round_level_idx] ON [dbo].[ApprovalHistory]([requestId], [approvalRound], [approvalLevel]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ApprovalHistory_approverId_actionType_idx] ON [dbo].[ApprovalHistory]([approverId], [actionType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notification_userId_isRead_idx] ON [dbo].[Notification]([userId], [isRead]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [_CategoryToCorrectionType_B_index] ON [dbo].[_CategoryToCorrectionType]([B]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [_CategoryToLocation_B_index] ON [dbo].[_CategoryToLocation]([B]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [_CategoryToUser_B_index] ON [dbo].[_CategoryToUser]([B]);

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowVersion] ADD CONSTRAINT [WorkflowVersion_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[Category]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowVersion] ADD CONSTRAINT [WorkflowVersion_correctionTypeId_fkey] FOREIGN KEY ([correctionTypeId]) REFERENCES [dbo].[CorrectionType]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowVersion] ADD CONSTRAINT [WorkflowVersion_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowTransition] ADD CONSTRAINT [WorkflowTransition_workflowVersionId_fkey] FOREIGN KEY ([workflowVersionId]) REFERENCES [dbo].[WorkflowVersion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowTransition] ADD CONSTRAINT [WorkflowTransition_actionId_fkey] FOREIGN KEY ([actionId]) REFERENCES [dbo].[Action]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowTransition] ADD CONSTRAINT [WorkflowTransition_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[Category]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowTransition] ADD CONSTRAINT [WorkflowTransition_correctionTypeId_fkey] FOREIGN KEY ([correctionTypeId]) REFERENCES [dbo].[CorrectionType]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowTransition] ADD CONSTRAINT [WorkflowTransition_currentStatusId_fkey] FOREIGN KEY ([currentStatusId]) REFERENCES [dbo].[Status]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowTransition] ADD CONSTRAINT [WorkflowTransition_nextStatusId_fkey] FOREIGN KEY ([nextStatusId]) REFERENCES [dbo].[Status]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowTransition] ADD CONSTRAINT [WorkflowTransition_requiredRoleId_fkey] FOREIGN KEY ([requiredRoleId]) REFERENCES [dbo].[Role]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[WorkflowStep] ADD CONSTRAINT [WorkflowStep_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[Category]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SpecialApproverMapping] ADD CONSTRAINT [SpecialApproverMapping_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[Category]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SpecialApproverMapping] ADD CONSTRAINT [SpecialApproverMapping_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DocConfig] ADD CONSTRAINT [DocConfig_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[Category]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ITRequestF07] ADD CONSTRAINT [ITRequestF07_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[Category]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ITRequestF07] ADD CONSTRAINT [ITRequestF07_workflowVersionId_fkey] FOREIGN KEY ([workflowVersionId]) REFERENCES [dbo].[WorkflowVersion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ITRequestF07] ADD CONSTRAINT [ITRequestF07_currentStatusId_fkey] FOREIGN KEY ([currentStatusId]) REFERENCES [dbo].[Status]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ITRequestF07] ADD CONSTRAINT [ITRequestF07_departmentId_fkey] FOREIGN KEY ([departmentId]) REFERENCES [dbo].[Department]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ITRequestF07] ADD CONSTRAINT [ITRequestF07_locationId_fkey] FOREIGN KEY ([locationId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ITRequestF07] ADD CONSTRAINT [ITRequestF07_requesterId_fkey] FOREIGN KEY ([requesterId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RequestCorrectionType] ADD CONSTRAINT [RequestCorrectionType_correctionTypeId_fkey] FOREIGN KEY ([correctionTypeId]) REFERENCES [dbo].[CorrectionType]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RequestCorrectionType] ADD CONSTRAINT [RequestCorrectionType_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ITRequestF07]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ITRequestF07]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ApprovalHistory] ADD CONSTRAINT [ApprovalHistory_approverId_fkey] FOREIGN KEY ([approverId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ApprovalHistory] ADD CONSTRAINT [ApprovalHistory_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ITRequestF07]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Notification] ADD CONSTRAINT [Notification_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ITRequestF07]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Notification] ADD CONSTRAINT [Notification_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[_CategoryToCorrectionType] ADD CONSTRAINT [_CategoryToCorrectionType_A_fkey] FOREIGN KEY ([A]) REFERENCES [dbo].[Category]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[_CategoryToCorrectionType] ADD CONSTRAINT [_CategoryToCorrectionType_B_fkey] FOREIGN KEY ([B]) REFERENCES [dbo].[CorrectionType]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[_CategoryToLocation] ADD CONSTRAINT [_CategoryToLocation_A_fkey] FOREIGN KEY ([A]) REFERENCES [dbo].[Category]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[_CategoryToLocation] ADD CONSTRAINT [_CategoryToLocation_B_fkey] FOREIGN KEY ([B]) REFERENCES [dbo].[Location]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[_CategoryToUser] ADD CONSTRAINT [_CategoryToUser_A_fkey] FOREIGN KEY ([A]) REFERENCES [dbo].[Category]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[_CategoryToUser] ADD CONSTRAINT [_CategoryToUser_B_fkey] FOREIGN KEY ([B]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
