import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from '../components/data-table';
import type { ColumnDef } from '../types';

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const testData: TestRow[] = [
  { id: '1', name: 'Alpha', value: 10 },
  { id: '2', name: 'Beta', value: 20 },
  { id: '3', name: 'Gamma', value: 30 },
  { id: '4', name: 'Delta', value: 40 },
  { id: '5', name: 'Epsilon', value: 50 },
];

const columns: ColumnDef<TestRow>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name, sortable: true },
  { key: 'value', header: 'Value', render: (r) => r.value, sortable: true },
];

describe('DataTable', () => {
  it('renders all rows', () => {
    render(<DataTable columns={columns} data={testData} rowKey={(r) => r.id} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<DataTable columns={columns} data={testData} rowKey={(r) => r.id} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('shows empty message when no data', () => {
    render(<DataTable columns={columns} data={[]} rowKey={(r) => r.id} />);
    expect(screen.getByText('No data to display')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<DataTable columns={columns} data={[]} rowKey={(r) => r.id} loading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders accessible caption when provided', () => {
    const { container } = render(
      <DataTable columns={columns} data={testData} rowKey={(r) => r.id} caption="Test table" />,
    );
    const caption = container.querySelector('caption');
    expect(caption).toBeInTheDocument();
    expect(caption!.textContent).toBe('Test table');
  });

  it('calls onRowClick when row is clicked', () => {
    const onClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={testData}
        rowKey={(r) => r.id}
        onRowClick={onClick}
      />,
    );
    fireEvent.click(screen.getByText('Alpha'));
    expect(onClick).toHaveBeenCalledWith(testData[0]);
  });

  it('handles pagination — shows subset of data', () => {
    const manyRows = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: `Row ${i}`,
      value: i,
    }));
    render(
      <DataTable
        columns={columns}
        data={manyRows}
        rowKey={(r) => r.id}
        pagination={{ pageIndex: 0, pageSize: 10 }}
      />,
    );
    // Should only show first 10
    expect(screen.getByText('Row 0')).toBeInTheDocument();
    expect(screen.getByText('Row 9')).toBeInTheDocument();
    expect(screen.queryByText('Row 10')).not.toBeInTheDocument();
  });

  it('shows pagination controls for multi-page data', () => {
    const manyRows = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: `Row ${i}`,
      value: i,
    }));
    render(
      <DataTable
        columns={columns}
        data={manyRows}
        rowKey={(r) => r.id}
        pagination={{ pageIndex: 0, pageSize: 10 }}
      />,
    );
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('calls onPageChange when navigating', () => {
    const onPageChange = vi.fn();
    const manyRows = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: `Row ${i}`,
      value: i,
    }));
    render(
      <DataTable
        columns={columns}
        data={manyRows}
        rowKey={(r) => r.id}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('disables previous button on first page', () => {
    const manyRows = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: `Row ${i}`,
      value: i,
    }));
    render(
      <DataTable
        columns={columns}
        data={manyRows}
        rowKey={(r) => r.id}
        pagination={{ pageIndex: 0, pageSize: 10 }}
      />,
    );
    const prevBtn = screen.getByLabelText('Previous page');
    expect(prevBtn).toBeDisabled();
  });

  it('calls onSortChange when sortable header clicked', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={testData}
        rowKey={(r) => r.id}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByText('Name'));
    expect(onSortChange).toHaveBeenCalledWith({ column: 'name', direction: 'asc' });
  });

  it('toggles sort direction on second click', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={testData}
        rowKey={(r) => r.id}
        sort={{ column: 'name', direction: 'asc' }}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByText('Name'));
    expect(onSortChange).toHaveBeenCalledWith({ column: 'name', direction: 'desc' });
  });

  it('shows sort indicator on sorted column', () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        rowKey={(r) => r.id}
        sort={{ column: 'name', direction: 'asc' }}
      />,
    );
    expect(screen.getByText('▲')).toBeInTheDocument();
  });

  it('sets aria-sort on sorted column header', () => {
    render(
      <DataTable
        columns={columns}
        data={testData}
        rowKey={(r) => r.id}
        sort={{ column: 'name', direction: 'desc' }}
      />,
    );
    const header = screen.getByText('Name').closest('th');
    expect(header!.getAttribute('aria-sort')).toBe('descending');
  });
});
