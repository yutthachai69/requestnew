/* Safe, idempotent dev/staging change. Run after the duplicate preflight. */
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes i
    INNER JOIN sys.tables t ON i.object_id = t.object_id
    WHERE t.name = N'DocConfig'
      AND i.name = N'DocConfig_categoryId_year_key'
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [DocConfig_categoryId_year_key]
    ON [dbo].[DocConfig] ([categoryId], [year]);
END;
