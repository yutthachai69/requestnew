/* แยกหมวด "ทั่วไป" ให้เป็น Workflow กลางของระบบ ไม่ใช่หมวดที่ผู้ใช้เลือก */
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF COL_LENGTH('dbo.Category', 'isWorkflowTemplate') IS NULL
  BEGIN
    ALTER TABLE dbo.Category
      ADD isWorkflowTemplate bit NOT NULL
        CONSTRAINT Category_isWorkflowTemplate_df DEFAULT (0);
  END;

  /* SQL Server compiles a whole batch before running it. Keep statements that
     reference the newly-added column in a dynamic batch so this script works
     both when the column is new and when it already exists. */
  EXEC sys.sp_executesql N'
    /* Requirement ล่าสุด: คลังสินค้าใช้ Flow เดียวกับหมวดอื่น */
    UPDATE dbo.Category
    SET requiresCCSClosing = 1
    WHERE name = N''คลังสินค้า'';

    /* หมวดนี้ใช้เก็บ Workflow กลางเท่านั้น และจะไม่ถูกส่งไป Sidebar */
    UPDATE dbo.Category
    SET isWorkflowTemplate = 1,
        requiresCCSClosing = 1
    WHERE name = N''ทั่วไป'';

    /* Olderทดลอง seed อาจผูกประเภท "ทั่วไป 2" ไว้กับทุกหมวด
       ให้คงความสัมพันธ์ไว้เฉพาะ Workflow กลางเท่านั้น */
    DECLARE @TemplateCategoryId int = (SELECT TOP (1) id FROM dbo.Category WHERE isWorkflowTemplate = 1);
    DECLARE @SharedCorrectionTypeId int = (SELECT TOP (1) id FROM dbo.CorrectionType WHERE name = N''ทั่วไป 2'');
    IF @TemplateCategoryId IS NOT NULL AND @SharedCorrectionTypeId IS NOT NULL
    BEGIN
      DELETE FROM dbo._CategoryToCorrectionType
      WHERE B = @SharedCorrectionTypeId AND A <> @TemplateCategoryId;
    END;';

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
